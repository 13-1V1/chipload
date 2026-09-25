import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
const base = process.env.CALC_BASE_URL || "http://127.0.0.1:4181/Machinist_calc/";
let server;
before(async () => {
  await mkdir(new URL("./output/playwright/",import.meta.url),{recursive:true});
  if(process.env.CALC_BASE_URL) return;
  server=spawn(process.execPath,["serve.mjs","--base=/Machinist_calc/","--port=4181"],{cwd:import.meta.dirname,stdio:["ignore","pipe","pipe"]});
  await new Promise((resolve,reject)=>{server.stdout.once("data",resolve);server.once("error",reject);server.once("exit",code=>reject(new Error(`Server exited ${code}`)));});
});
after(()=>server?.kill());
const near = (actual, expected, tolerance=1e-8) => assert.ok(Math.abs(Number(actual)-expected)<tolerance,`${actual} != ${expected}`);

for(const [engineName,engine] of Object.entries({chromium,webkit})) {
  describe(engineName,{concurrency:false},()=>{
    let browser;
    before(async()=>{browser=await engine.launch();});
    after(async()=>{await browser?.close();});
    async function scenario(t, run, options={}) {
      const {url=base,...contextOptions}=options;
      const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:"en-US",reducedMotion:"reduce",serviceWorkers:"block",...contextOptions});
      const page=await context.newPage();
      page.setDefaultTimeout(6000);
      const errors=[];
      page.on("pageerror",error=>errors.push(error.message));
      try {
        await page.goto(url);
        await page.waitForFunction(()=>document.documentElement.dataset.appReady==="true");
        await page.evaluate(()=>document.fonts.ready);
        await run(page,context);
        assert.deepEqual(errors,[],"Browser errors");
      } catch(error) {
        await page.screenshot({path:`output/playwright/${engineName}-${t.name.replace(/[^a-z0-9]+/gi,"-")}-failure.png`,fullPage:true}).catch(()=>{});
        throw error;
      } finally {await context.close();}
    }
    const tool = async(page,name)=>{
      await page.locator("#mobileToolPicker").selectOption(name);
      await page.waitForFunction(name=>document.querySelector('.tool-card.active-tool')?.dataset.tool===name,name);
    };
    const calculate = async(page,name)=>{
      await page.locator("#mobileCalculate").click();
      await page.waitForFunction(name=>document.querySelector(`#tool-${name} .result-shell`)?.dataset.resultState==="current",name);
    };
    test("stale and invalid results cannot be used; Live preserves focus and details",async t=>scenario(t,async page=>{
      await page.locator("#threadQuickSpec").fill("1/4-20");
      await calculate(page,"thread");
      assert.match(await page.locator("#threadPrimary").innerText(),/#7/);
      await page.locator("#threadQuickSpec").fill("M10");
      assert.equal(await page.locator("#threadCopy").isDisabled(),true);
      assert.match(await page.locator("#threadResultStatus").innerText(),/recalculate/);
      await page.locator("#threadQuickSpec").press("Enter");
      assert.match(await page.locator("#threadPrimary").innerText(),/8.5 mm/);
      await tool(page,"feeds");
      await page.locator("#sfDiameter").fill("0.375");
      await calculate(page,"feeds");
      assert.match(await page.locator("#sfPrimary").innerText(),/3565 RPM/);
      await page.locator("#tool-feeds .result-detail-toggle").click();
      await page.locator("label.live-toggle").click();
      await page.locator("#sfDiameter").fill("0");
      await page.waitForFunction(()=>document.querySelector('#tool-feeds .result-shell').dataset.resultState==="invalid");
      assert.equal(await page.locator("#sfCopy").isDisabled(),true);
      assert.equal(await page.locator("#sfShare").isDisabled(),true);
      assert.equal(await page.evaluate(()=>document.activeElement.id),"sfDiameter");
      assert.equal(await page.locator("#tool-feeds .result-detail-toggle").getAttribute("aria-expanded"),"true");
      await page.locator("#mobileCalculate").click();
      assert.match(await page.locator("#sfWarn").innerText(),/positive/);
      assert.equal(await page.locator("#sfDiameter").getAttribute("aria-invalid"),"true");
      await page.locator("#sfDiameter").fill("0.5");
      await page.waitForFunction(()=>document.querySelector('#tool-feeds .result-shell').dataset.resultState==="current");
      assert.equal(await page.locator("#sfCopy").isEnabled(),true);
      assert.equal(await page.locator("#sfDiameter").getAttribute("aria-invalid"),null);
      await page.locator("#sfFlutes").fill("0");
      await page.waitForFunction(()=>document.querySelector('#tool-feeds .result-shell').dataset.resultState==="invalid");
      assert.equal(await page.evaluate(()=>document.activeElement.id),"sfFlutes");
      assert.equal(await page.locator("#sfWarn").getAttribute("aria-live"),"off");
      assert.equal(await page.locator("#sfFlutes").getAttribute("aria-invalid"),"true");
    }));

    test("unit changes preserve dimensions, overrides, pitch and coordinate geometry",async t=>scenario(t,async page=>{
      await tool(page,"feeds");
      await page.locator("#sfDiameter").fill("0.375");
      await page.locator("#sfAdvancedOptions summary").click();
      for(const [id,value] of Object.entries({sfSpeed:"350",sfChipLoad:"0.003",sfWoc:"0.1",sfDoc:"0.2"})) await page.locator('#'+id).fill(value);
      await calculate(page,"feeds");
      for(let i=0;i<8;i++) {
        await page.locator("#sfUnits").selectOption("mm");
        near(await page.locator("#sfDiameter").inputValue(),9.525);
        near(await page.locator("#sfSpeed").inputValue(),106.68);
        near(await page.locator("#sfChipLoad").inputValue(),0.0762);
        await calculate(page,"feeds");
        assert.match(await page.locator("#sfPrimary").innerText(),/3565 RPM/);
        await page.locator("#sfUnits").selectOption("in");
      }
      near(await page.locator("#sfDiameter").inputValue(),0.375);
      near(await page.locator("#sfChipLoad").inputValue(),0.003);
      await tool(page,"mow");
      await page.locator("#mowPitchInput").fill("20");
      await page.locator("#mowWire").fill("0.018");
      await page.locator("#mowE").fill("0.2175");
      await page.locator("#mowUnits").selectOption("mm");
      near(await page.locator("#mowPitchInput").inputValue(),1.27);
      near(await page.locator("#mowWire").inputValue(),0.4572);
      await calculate(page,"mow");
      await tool(page,"triangle");
      await page.locator("#rtRun").fill("3");
      await page.locator("#rtRise").fill("4");
      await page.locator("#rtUnits").selectOption("mm");
      near(await page.locator("#rtRun").inputValue(),76.2);
      await calculate(page,"triangle");
      assert.match(await page.locator("#rtStats").textContent(),/127/);
      await tool(page,"bolt");
      await page.locator("#bcDia").fill("4");
      await page.locator("#bcHoles").fill("4");
      await page.locator("#bcUnits").selectOption("mm");
      near(await page.locator("#bcDia").inputValue(),101.6);
      await calculate(page,"bolt");
      await tool(page,"advanced");
      await page.locator("#advancedUnits").selectOption("mm");
      near(await page.locator("#advTapThread").inputValue(),1.27);
      await calculate(page,"advanced");
      assert.match(await page.locator("#advancedPrimary").innerText(),/635/);
      await tool(page,"chamfer");
      await page.locator("#chSmall").fill("0.25");
      await page.locator("#chLarge").fill("0.5");
      await page.locator("#chUnits").selectOption("mm");
      near(await page.locator("#chLarge").inputValue(),12.7);
      await calculate(page,"chamfer");
      await tool(page,"circle3");
      for(const [id,value] of Object.entries({c3x1:"-1",c3y1:"0",c3x2:"1",c3y2:"0",c3x3:"0",c3y3:"1"})) await page.locator('#'+id).fill(value);
      await page.locator("#c3Units").selectOption("mm");
      near(await page.locator("#c3x1").inputValue(),-25.4);
      await calculate(page,"circle3");
      assert.match(await page.locator("#c3Primary").innerText(),/50.8/);
    }));

    test("shortcuts and hash navigation override the remembered calculator",async t=>scenario(t,async page=>{
      for(const name of ["feeds","bolt","thread","triangle"]) {
        await page.goto(base+"#tool-"+name);
        await page.waitForFunction(name=>document.getElementById('mobileToolPicker').value===name,name);
        assert.equal(await page.locator(`#tool-${name} .result-shell`).getAttribute("data-result-state"),"empty");
      }
      await page.reload();
      await page.waitForFunction(()=>document.documentElement.dataset.appReady==="true");
      assert.equal(await page.locator("#mobileToolPicker").inputValue(),"triangle");
    }));

    test("profile actions stay visible and selecting a machine converts existing inputs",async t=>scenario(t,async page=>{
      await tool(page,"feeds");
      await page.locator("#sfDiameter").fill("0.375");
      await calculate(page,"feeds");
      await page.locator("#workspaceBtn").click();
      await page.locator("#machineName").fill("Haas VF-2 Main Shop — long machine profile name");
      await page.locator("#machineUnits").selectOption("mm");
      await page.locator("#machineMaxRpm").fill("1000");
      await page.locator("#machineMaxFeed").fill("2540");
      await page.getByRole("button",{name:"Save machine",exact:true}).click();
      for(const width of [320,390]) {
        await page.setViewportSize({width,height:844});
        const use=page.locator('#machineProfileList [data-action="activate"]');
        await use.scrollIntoViewIfNeeded();
        const bounds=await page.locator("#machineProfileList .library-actions").boundingBox();
        assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width,`Profile actions overflow at ${width}`);
      }
      await page.locator('#machineProfileList [data-action="activate"]').click();
      assert.equal(await page.locator("#sfUnits").inputValue(),"mm");
      near(await page.locator("#sfDiameter").inputValue(),9.525);
      await page.locator("#workspaceSectionPicker").selectOption("status");
      await page.locator("#installHelpBtn").click();
      assert.equal(await page.locator("#installHelp").getAttribute("open"),"");
      await page.locator("#workspaceClose").click();
      await calculate(page,"feeds");
      assert.match(await page.locator("#sfPrimary").innerText(),/1000 RPM/);
      await page.locator("#workspaceBtn").click();
      await page.locator("#workspaceSectionPicker").selectOption("tools");
      await page.locator("#toolProfileUnits").selectOption("mm");
      await page.locator("#toolProfileName").fill("6 mm tool");
      await page.locator("#toolProfileDiameter").fill("6");
      await page.locator("#toolProfileSfm").fill("120");
      await page.locator("#toolProfileChip").fill("0.05");
      await page.getByRole("button",{name:"Save tool",exact:true}).click();
      await page.locator('#toolProfileList [data-action="apply"]').click();
      near(await page.locator("#sfDiameter").inputValue(),6);
      near(await page.locator("#sfSpeed").inputValue(),120,0.1);
      near(await page.locator("#sfChipLoad").inputValue(),0.05,0.0001);
    }));

    test("number helpers, decimal commas and explicit result visibility",async t=>scenario(t,async page=>{
      await tool(page,"circle3");
      await page.locator("#c3x1").fill("0.125");
      await page.getByRole("button",{name:"Change sign",exact:true}).click();
      assert.equal(await page.locator("#c3x1").inputValue(),"-0.125");
      await page.getByRole("button",{name:"Switch to fraction entry",exact:true}).click();
      assert.equal(await page.locator("#c3x1").getAttribute("inputmode"),"text");
      await page.locator("#c3x1").fill("-3/8");
      for(const [id,value] of Object.entries({c3y1:"0",c3x2:"3/8",c3y2:"0",c3x3:"0",c3y3:"0,375"})) await page.locator('#'+id).fill(value);
      await page.locator("#c3y3").press("Enter");
      await page.waitForFunction(()=>document.querySelector('#tool-circle3 .result-shell').dataset.resultState==="current");
      assert.match(await page.locator("#c3Primary").innerText(),/0.75/);
      await page.waitForTimeout(150);
      const primary=await page.locator("#c3Primary").boundingBox();
      const dock=await page.locator("#mobileDock").boundingBox();
      const nav=await page.locator("#sectionNav").boundingBox();
      assert.ok(primary.y >= nav.y+nav.height-2 && primary.y+primary.height<=dock.y, "Explicit answer must be visible above the dock");
      assert.match(await page.locator("#calculationStatus").textContent(),/0.75/);
    }));

    test("G-code preflight and exports expire after geometry edits and history restore",async t=>scenario(t,async page=>{
      await tool(page,"bolt");
      await page.locator("#bcDia").fill("4");
      await page.locator("#bcHoles").fill("4");
      await page.locator("#boltSetupOptions summary").click();
      await page.locator("#bcGcode").check();
      for(const id of ["bcCheckUnits","bcCheckOffset","bcCheckMotion"]) await page.locator('#'+id).check();
      await calculate(page,"bolt");
      assert.match(await page.locator("#bcCopy").getAttribute("data-copy-text"),/G20/);
      assert.equal(await page.locator("#bcExportCsv").isEnabled(),true);
      await page.locator("#bcDia").fill("5");
      assert.equal(await page.locator("#bcCheckMotion").isChecked(),false);
      assert.equal(await page.locator("#bcExportCsv").isDisabled(),true);
      assert.equal(await page.locator("#bcExportDxf").isDisabled(),true);
      await page.locator("#mobileCalculate").click();
      assert.match(await page.locator("#bcWarn").innerText(),/preflight/);
      for(const id of ["bcCheckUnits","bcCheckOffset","bcCheckMotion"]) await page.locator('#'+id).check();
      await calculate(page,"bolt");
      await page.locator("#histToggle-bolt").click();
      await page.locator('[data-hist-tool="bolt"]').last().click();
      assert.equal(await page.locator("#bcDia").inputValue(),"4");
      assert.equal(await page.locator("#bcCheckUnits").isChecked(),false);
      assert.equal(await page.locator("#bcCopy").isDisabled(),true);
      assert.match(await page.locator("#bcWarn").innerText(),/preflight/);
    }));

    test("resets preserve units and restored advanced modes and machine limits stay consistent",async t=>scenario(t,async page=>{
      await tool(page,"feeds");
      await page.locator("#sfDiameter").fill("0.5");
      await page.locator("#btnSfClear").click();
      assert.equal(await page.locator("#sfUnits").inputValue(),"in");
      await tool(page,"advanced");
      await page.locator("#advancedUnits").selectOption("mm");
      await page.locator("#btnAdvancedClear").click();
      assert.equal(await page.locator("#advancedUnits").inputValue(),"mm");
      near(await page.locator("#advTapThread").inputValue(),1.27);
      await page.locator("#advancedMode").selectOption("sine");
      await calculate(page,"advanced");
      await page.waitForTimeout(400);
      await page.reload();
      await page.waitForFunction(()=>document.documentElement.dataset.appReady==="true");
      assert.equal(await page.locator('[data-advanced-panel="sine"]').isVisible(),true);
      await page.locator("#advancedMode").selectOption("tapping");
      await calculate(page,"advanced");
      assert.match(await page.locator("#advancedPrimary").innerText(),/635/);
      await page.locator("#workspaceBtn").click();
      await page.locator("#machineName").fill("Slow spindle");
      await page.locator("#machineMaxRpm").fill("100");
      await page.getByRole("button",{name:"Save machine",exact:true}).click();
      await page.locator("#workspaceClose").click();
      assert.equal(await page.locator("#advancedCopy").isDisabled(),true);
      await calculate(page,"advanced");
      assert.match(await page.locator("#advancedPrimary").innerText(),/127/);
      await page.locator("#workspaceBtn").click();
      await page.locator("#workspaceSectionPicker").selectOption("materials");
      await page.locator("#materialProfileName").fill("Shop aluminum");
      await page.getByRole("button",{name:"Save material",exact:true}).click();
      await page.locator('#materialProfileList [data-action="apply"]').click();
      const material=await page.locator("#sfMaterial").inputValue();
      await page.locator("#sfSetupOptions summary").click();
      await page.locator("#sfOperation").selectOption("drilling");
      assert.equal(await page.locator("#sfMaterial").inputValue(),material);
      await page.locator("#sfOpenWorkspace").click();
      await page.locator("#workspaceClose").click();
      assert.equal(await page.locator("#sfMaterial").inputValue(),material);
    }));

    test("layouts fit all eight calculators and both themes",async t=>scenario(t,async page=>{
      for(const width of [320,360,390,430,768,1280]) {
        await page.setViewportSize({width,height:844});
        for(const name of ["thread","mow","bolt","triangle","feeds","chamfer","circle3","advanced"]) {
          if(width>1080) await page.locator(`[data-tool-link="${name}"]`).click();
          else await tool(page,name);
          const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
          assert.ok(fits,`${name} overflows at ${width}`);
        }
      }
      await page.setViewportSize({width:390,height:844});
      await tool(page,"feeds");
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
      const lastInput=await page.locator("#sfFlutes").boundingBox();
      assert.ok(lastInput.y + lastInput.height < 700,`Primary feeds workflow too tall: ${lastInput.y}`);
      assert.equal(await page.locator('#feedsForm button[type="submit"]').isVisible(),false);
      for(const theme of ["light","dark"]) {
        if(await page.locator('html').getAttribute('data-theme')!==theme) await page.locator('#themeToggle').click();
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        await page.screenshot({path:`output/playwright/${engineName}-390-feeds-${theme}.png`,fullPage:true});
        assert.equal(await page.locator("#mobileCalculate").isVisible(),true);
      }
      await page.setViewportSize({width:320,height:668});
      const header=await page.locator("#siteHeader").boundingBox();
      assert.ok(header.height<90,`Narrow header too tall: ${header.height}`);
      await page.screenshot({path:`output/playwright/${engineName}-320-feeds.png`});
    }));

    test("history is deduplicated and edits and resets persist",async t=>scenario(t,async(page,context)=>{
      await page.locator("#threadQuickSpec").fill("1/4-20");
      await calculate(page,"thread");
      await calculate(page,"thread");
      assert.equal(await page.locator("#histBadge-thread").innerText(),"1");
      await page.locator("#threadQuickSpec").fill("M8");
      await page.waitForTimeout(400);
      await page.reload();
      await page.waitForFunction(()=>document.documentElement.dataset.appReady==="true");
      assert.equal(await page.locator("#threadQuickSpec").inputValue(),"M8");
      await page.locator('#threadForm .action-row button[type="button"]').click();
      await page.waitForTimeout(400);
      await page.reload();
      await page.waitForFunction(()=>document.documentElement.dataset.appReady==="true");
      assert.equal(await page.locator("#threadQuickSpec").inputValue(),"");
      const linked=await context.newPage();
      await linked.goto(base+'#tool=feeds&sfUnits=in&sfDiameter=0.375&sfFlutes=2&sfTool=carbide&sfMaterial=mildSteel');
      await linked.waitForFunction(()=>document.documentElement.dataset.appReady==="true");
      assert.match(await linked.locator("#sfPrimary").innerText(),/3565 RPM/);
      await linked.close();
    }));

    test("primary operation, individual answers and mobile actions stay usable",async t=>scenario(t,async page=>{
      await tool(page,"feeds");
      assert.equal(await page.locator("#sfOperation").isVisible(),true);
      assert.equal(await page.locator("#sfSetupOptions").getAttribute("open"),null);
      assert.equal(await page.locator("#tool-feeds .tool-toggle").isVisible(),false);
      assert.equal(await page.locator("#tool-feeds .result-shell").isVisible(),false);
      await page.locator("#sfDiameter").fill("0.375");
      await page.locator("#sfOperation").selectOption("drilling");
      await calculate(page,"feeds");
      assert.match(await page.locator("#sfPrimary").innerText(),/2674 RPM/);
      await page.evaluate(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>{window.copiedValue=text;}}}));
      for(const label of ["RPM","feed"]) {
        const button=page.getByRole("button",{name:`Copy ${label} value`,exact:true});
        const value=await button.getAttribute("data-copy-value");
        await button.click();
        assert.equal(await page.evaluate(()=>window.copiedValue),value);
      }
      const metrics=await page.locator("#sfMetrics").boundingBox();
      const dock=await page.locator("#mobileDock").boundingBox();
      assert.ok(metrics.y+metrics.height<=dock.y,"Both values visible above Calculate");
      await page.locator("#sfDiameter").fill("0.5");
      assert.equal(await page.getByRole("button",{name:"Copy RPM value",exact:true}).isDisabled(),true);
      assert.equal(await page.locator('[data-favorite="feeds"]').isDisabled(),true);
      // Simulate the viewport reduction produced by an on-screen keyboard.
      await page.evaluate(()=>{Object.defineProperty(visualViewport,"height",{configurable:true,value:350});visualViewport.dispatchEvent(new Event("resize"));});
      assert.equal(await page.locator("#mobileCalculate").isVisible(),false);
      assert.equal(await page.locator('#feedsForm button[type="submit"]').isVisible(),true);
      await page.locator("#sfDiameter").press("Enter");
      await page.waitForFunction(()=>document.querySelector('#tool-feeds .result-shell').dataset.resultState==="current");
      await page.evaluate(()=>{delete visualViewport.height;visualViewport.dispatchEvent(new Event("resize"));});
      await page.setViewportSize({width:1280,height:900});
      assert.equal(await page.locator("#sfStats").isVisible(),false);
      await page.locator("#tool-feeds .result-detail-toggle").click();
      assert.equal(await page.locator("#sfStats").isVisible(),true);
      for(const theme of ["light","dark"]) {
        if(await page.locator("html").getAttribute("data-theme")!==theme) await page.locator("#themeToggle").click();
        const {button,icon}=await page.evaluate(()=>({
          button:document.getElementById("themeToggle").getBoundingClientRect().toJSON(),
          icon:[...document.querySelectorAll("#themeIcon svg")].find(svg=>getComputedStyle(svg).display!=="none").getBoundingClientRect().toJSON(),
        }));
        near(icon.x+icon.width/2,button.x+button.width/2,0.6);
        near(icon.y+icon.height/2,button.y+button.height/2,0.6);
      }
    }));

    test("favorites restore recognizable setups and persist independently of recent history",async t=>scenario(t,async page=>{
      await tool(page,"feeds");
      await page.locator("#sfDiameter").fill("3/8");
      await calculate(page,"feeds");
      await page.locator('[data-favorite="feeds"]').click();
      await page.locator("#histToggle-feeds").click();
      await page.locator('#histList-feeds .history-item-primary').waitFor({state:"visible"});
      await page.waitForFunction(()=>document.querySelector('#histList-feeds .history-item-primary').innerText.length>0);
      assert.match(await page.locator('#histList-feeds .history-item-primary').innerText(),/3\/8 in Carbide.*Mild steel.*milling/);
      await page.locator('[data-hist-clear="feeds"]').click();
      await page.locator("#btnSfClear").click();
      await page.reload();
      await page.waitForFunction(()=>document.documentElement.dataset.appReady==="true");
      await page.locator("#favorites-feeds summary").click();
      await page.locator('[data-favorite-restore="feeds"]').click();
      assert.equal(await page.locator("#sfDiameter").inputValue(),"3/8");
      assert.match(await page.locator("#sfPrimary").innerText(),/3565 RPM/);
      assert.equal(await page.locator('[data-favorite="feeds"]').getAttribute("aria-pressed"),"true");
      assert.match(await page.locator("#feedsForm .setup-context").innerText(),/No machine limits/);
      await page.locator('[data-favorite-remove="feeds"]').click();
      assert.equal(await page.locator("#favorites-feeds").isVisible(),false);
      assert.equal(await page.locator("#histBadge-feeds").innerText(),"1");
    }));

    test("shared calculations reproduce custom materials and limits on another device",async t=>scenario(t,async page=>{
      const machine={id:"mill",name:"Source mill",units:"in",maxRpm:1000,maxFeed:2,controller:"haas",workOffset:"G55",safeZ:0.1};
      const workspace={machines:[machine],materials:[{id:"stock",name:"Shop stock",sfm:350,chipIn:0.003}],tools:[],jobs:[],activeMachineId:"mill"};
      await page.evaluate(workspace=>localStorage.setItem("marcos_shop_workspace_v3",JSON.stringify(workspace)),workspace);
      await page.reload();
      await page.waitForFunction(()=>document.documentElement.dataset.appReady==="true");
      await tool(page,"feeds");
      await page.locator("#sfMaterial").selectOption("user:stock");
      await page.locator("#sfDiameter").fill("3/8");
      await calculate(page,"feeds");
      assert.match(await page.locator("#sfPrimary").innerText(),/1000 RPM.*2 IPM/);
      const expected=await page.locator("#sfPrimary").innerText();
      const share=async(name="feeds")=>{
        await page.evaluate(()=>Object.defineProperty(navigator,"share",{configurable:true,value:async({url})=>{window.sharedUrl=url;}}));
        await page.locator(`[data-share-tool="${name}"]`).click();
        return page.evaluate(()=>window.sharedUrl);
      };
      const url=await share();
      const params=new URLSearchParams(new URL(url).hash.slice(1));
      assert.equal(params.get("sfSpeed"),"");
      assert.equal(JSON.parse(params.get("__context")).machine.maxRpm,1000);
      const recipient=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:"block"});
      try {
        const second=await recipient.newPage();
        const local={...workspace,machines:[{...machine,name:"Recipient mill",units:"mm",maxRpm:500,maxFeed:254}],materials:[{...workspace.materials[0],sfm:900,chipIn:.01}]};
        await second.goto(base);
        await second.waitForFunction(()=>document.documentElement.dataset.appReady==="true");
        await second.evaluate(local=>{
          localStorage.setItem("marcos_shop_workspace_v3",JSON.stringify(local));
          localStorage.setItem("marcos_persist_feedsForm",JSON.stringify({sfUnits:"mm",sfSpeed:"900",sfChipLoad:".4"}));
        },local);
        await second.goto(url);
        await second.waitForFunction(()=>document.querySelector('#tool-feeds .result-shell').dataset.resultState==="current");
        assert.equal(await second.locator("#sfPrimary").innerText(),expected);
        assert.match(await second.locator("#sfLimitSummary").innerText(),/RPM limit applied.*Feed limit applied/);
        assert.equal(await second.locator("#sfSpeed").inputValue(),"");
        assert.deepEqual(await second.evaluate(()=>JSON.parse(localStorage.getItem("marcos_shop_workspace_v3"))),local);
        await second.locator('[data-favorite="feeds"]').click();
        await second.evaluate(()=>history.replaceState(null,"",location.pathname));
        await second.waitForTimeout(400);
        await second.reload();
        await second.waitForFunction(()=>document.documentElement.dataset.appReady==="true");
        await calculate(second,"feeds");
        assert.equal(await second.locator("#sfPrimary").innerText(),expected);
        await second.locator('[data-use-local="feeds"]').click();
        assert.equal(await second.locator("#sfCopy").isDisabled(),true);
        await calculate(second,"feeds");
        assert.match(await second.locator("#sfPrimary").innerText(),/500 RPM/);
        await second.locator("#favorites-feeds summary").click();
        await second.locator('[data-favorite-restore="feeds"]').click();
        assert.equal(await second.locator("#sfPrimary").innerText(),expected);
        // Selecting a machine explicitly updates a restored calculation too.
        await second.locator("#workspaceBtn").click();
        await second.locator('#machineProfileList [data-action="activate"]').click();
        await second.locator("#workspaceClose").click();
        await calculate(second,"feeds");
        assert.match(await second.locator("#sfPrimary").innerText(),/500 RPM/);
        // Advanced calculators use the same portable RPM/feed envelope.
        await tool(page,"advanced");
        await page.locator("#advTapRpm").fill("2000");
        await calculate(page,"advanced");
        const tapping=await page.locator("#advancedPrimary").innerText();
        await second.goto(await share("advanced"));
        await second.waitForFunction(()=>document.querySelector('#tool-advanced .result-shell').dataset.resultState==="current");
        assert.equal(await second.locator("#advancedPrimary").innerText(),tapping);
        // An explicitly unlimited sender must also override the receiver's local cap.
        await page.evaluate(()=>localStorage.removeItem("marcos_shop_workspace_v3"));
        await page.reload();
        await page.waitForFunction(()=>document.documentElement.dataset.appReady==="true");
        await tool(page,"feeds");
        await page.locator("#sfMaterial").selectOption("mildSteel");
        await calculate(page,"feeds");
        await second.goto(await share());
        await second.waitForFunction(()=>document.querySelector('#tool-feeds .result-shell').dataset.resultState==="current");
        assert.match(await second.locator("#sfPrimary").innerText(),/3565 RPM/);
        assert.match(await second.locator("#sfLimitSummary").innerText(),/No machine limits/);
        // Unsupported settings do not silently produce an answer with local defaults.
        const bad=new URL(await share());
        const badParams=new URLSearchParams(bad.hash.slice(1));
        badParams.set("__context",JSON.stringify({version:99}));
        bad.hash=badParams.toString();
        await second.goto(bad.href);
        await second.waitForFunction(()=>document.querySelector('#tool-feeds .result-shell').dataset.resultState==="invalid");
        assert.match(await second.locator("#sfWarn").innerText(),/unsupported/);
        assert.equal(await second.locator("#sfCopy").isDisabled(),true);
      } finally { await recipient.close(); }
    }));

    if(engineName==="chromium") test("first install does not reload; offline calculation and unrelated cache survive",async t=>scenario(t,async(page,context)=>{
      let navigations=0;
      page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
      await page.locator("#threadQuickSpec").fill("M8");
      await page.evaluate(()=>caches.open('another-app-v1').then(cache=>cache.put('/sentinel',new Response('keep'))));
      await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
      assert.equal(navigations,0,"First activation must not reload the page");
      assert.equal(await page.locator("#threadQuickSpec").inputValue(),"M8");
      assert.ok((await page.evaluate(()=>caches.keys())).includes("another-app-v1"));
      await page.waitForTimeout(400);
      await context.setOffline(true);
      await page.reload();
      await page.waitForFunction(()=>document.documentElement.dataset.appReady==="true");
      await calculate(page,"thread");
      assert.match(await page.locator("#threadPrimary").innerText(),/6.8 mm/);
    },{serviceWorkers:"allow"}));

    if(engineName==="chromium") test("an accepted worker update flushes pending edits and reloads once",async t=>{
      let updated=false;
      // Serve a changed worker on a fresh origin without changing product files.
      const proxy=createServer(async(request,response)=>{
        try {
          const upstream=await fetch(new URL(request.url,base));
          let body=Buffer.from(await upstream.arrayBuffer());
          if(updated && request.url.endsWith('/sw.js')) body=Buffer.from(body.toString().replace('const APP_VERSION = "3.3.0"','const APP_VERSION = "3.3.0-update-test"'));
          response.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type'),'Cache-Control':'no-store'});
          response.end(body);
        } catch {response.writeHead(502);response.end();}
      });
      await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
      try {
        await scenario(t,async page=>{
          await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
          let navigations=0;
          page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
          updated=true;
          await page.evaluate(()=>navigator.serviceWorker.getRegistration().then(registration=>registration.update()));
          await page.locator('#pwaUpdateToast').waitFor();
          assert.equal(navigations,0,'Waiting update must not reload');
          await page.locator('#threadQuickSpec').fill('M12');
          await Promise.all([page.waitForEvent('framenavigated'),page.locator('.pwa-toast-reload').click()]);
          await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
          assert.equal(await page.locator('#threadQuickSpec').inputValue(),'M12');
          assert.equal(navigations,1);
          await page.waitForFunction(()=>document.getElementById('offlineCacheStatus').textContent.includes('update-test'));
        },{url:`http://127.0.0.1:${proxy.address().port}${new URL(base).pathname}`,serviceWorkers:'allow'});
      } finally {await new Promise(resolve=>proxy.close(resolve));}
    });
  });
}
