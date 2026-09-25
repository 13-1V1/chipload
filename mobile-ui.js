export function initMobileUI({ results, state, submit }) {
  const dock = document.getElementById("mobileDock");
  const answer = document.getElementById("mobileAnswer");
  const action = document.getElementById("mobileCalculate");
  const activeTool = () => document.querySelector(".tool-card.active-tool")?.dataset.tool || "thread";
  function updateDock() {
    const tool = activeTool();
    const result = results[tool];
    const current = state.isCurrent(tool);
    answer.textContent = current ? result.primary.textContent
      : result.state === "invalid" ? "Check inputs" : result.state === "stale" ? "Recalculate to update" : "Enter values to begin";
    answer.disabled = !result.snapshot && result.state === "empty";
    answer.setAttribute("aria-label", `${answer.textContent}. View answer`);
    dock.dataset.state = result.state;
    action.setAttribute("aria-label", `Calculate ${document.querySelector('.tool-card.active-tool h2')?.textContent || ''}`);
  }
  action.addEventListener("click", () => {
    const form = document.getElementById(`${activeTool()}Form`);
    submit(form);
  });
  answer.addEventListener("click", () => {
    const shell = results[activeTool()].shell;
    shell.scrollIntoView({ block: "start", behavior: "instant" });
    shell.focus({ preventScroll: true });
  });
  document.addEventListener("result-state-changed", updateDock);
  document.addEventListener("tool-change", updateDock);
  const keyboardState = () => {
    const editing = document.activeElement?.matches("input, textarea, select");
    const reducedViewport = window.visualViewport && visualViewport.height < innerHeight * 0.78;
    document.body.classList.toggle("keyboard-open", Boolean(editing && reducedViewport));
  };
  window.visualViewport?.addEventListener("resize", keyboardState);
  document.addEventListener("focusin", keyboardState);
  document.addEventListener("focusout", keyboardState);
  new ResizeObserver(() => {
    document.documentElement.style.setProperty("--dock-height", `${dock.offsetHeight}px`);
  }).observe(dock);

  // Keep Print available without giving it equal weight to Copy on phones.
  document.querySelectorAll(".result-actions").forEach(actions => {
    const print = actions.querySelector("[data-print]");
    const more = document.createElement("details");
    more.className = "result-more";
    more.hidden = print.hidden;
    const summary = document.createElement("summary");
    summary.textContent = "More";
    more.append(summary, print);
    actions.append(more);
  });
  updateDock();
}

export function initInputHelpers() {
  let activeInput = null;
  const helper = document.createElement("div");
  helper.className = "input-helper";
  helper.hidden = true;
  helper.setAttribute("role", "group");
  helper.setAttribute("aria-label", "Number entry helpers");
  helper.innerHTML = '<button type="button" data-number-action="sign" aria-label="Change sign">±</button><button type="button" data-number-action="fraction" aria-label="Switch to fraction entry">Fraction</button><button type="button" data-number-action="space" aria-label="Insert space for a mixed fraction">Space</button><button type="button" data-number-action="next">Next</button><button type="button" data-number-action="done">Done</button>';
  document.body.append(helper);
  const isNumeric = input => input?.matches('input[inputmode="decimal"], input[inputmode="numeric"], input[type="number"]');
  const announce = text => { document.getElementById("numberEntryStatus").textContent = text; };
  function attach(input) {
    activeInput = input;
    input.closest(".field")?.append(helper);
    helper.hidden = false;
    helper.querySelector('[data-number-action="fraction"]').hidden = input.type === "number";
    helper.querySelector('[data-number-action="space"]').hidden = input.type === "number" || input.inputMode !== "text";
    helper.querySelector('[data-number-action="fraction"]').textContent = input.inputMode === "text" ? "Decimal" : "Fraction";
    helper.querySelector('[data-number-action="fraction"]').setAttribute("aria-label", input.inputMode === "text" ? "Switch to decimal entry" : "Switch to fraction entry");
  }
  document.querySelectorAll('input[type="number"]').forEach(input => {
    input.inputMode = input.step === "1" ? "numeric" : "decimal";
    input.enterKeyHint = "done";
  });
  document.querySelectorAll('input[inputmode="decimal"]').forEach(input => { input.enterKeyHint = "done"; });
  document.addEventListener("focusin", event => {
    if (isNumeric(event.target) || event.target.matches?.('input[data-fraction-entry]')) attach(event.target);
  });
  function hideInactiveHelper() {
    if (document.activeElement !== activeInput && !helper.contains(document.activeElement)) helper.hidden = true;
  }
  // Do not remove a row on pointer-down/focus: that moves the control being
  // tapped before pointer-up and can cancel disclosure and Calculate clicks.
  document.addEventListener("click", hideInactiveHelper);
  document.addEventListener("keyup", hideInactiveHelper);
  document.addEventListener("submit", () => {
    if (document.activeElement !== activeInput) helper.hidden = true;
  });
  helper.addEventListener("pointerdown", event => {
    // Keep the keyboard and input selection while using sign/space actions.
    if (event.target.closest('button[data-number-action="sign"],button[data-number-action="space"]')) event.preventDefault();
  });
  helper.addEventListener("click", event => {
    const kind = event.target.closest("button")?.dataset.numberAction;
    const input = activeInput;
    if (!kind || !input) return;
    if (kind === "fraction") {
      const fraction = input.inputMode !== "text";
      input.inputMode = fraction ? "text" : "decimal";
      input.dataset.fractionEntry = "true";
      input.focus();
      attach(input);
      announce(fraction ? "Fraction entry: use slash for 3/8, or space for 1 1/2." : "Decimal entry enabled.");
      return;
    }
    if (kind === "next") {
      const fields = [...(input.form || document).querySelectorAll("input, select, textarea")].filter(el => !el.disabled && el.checkVisibility() && el.type !== "hidden");
      fields[fields.indexOf(input) + 1]?.focus();
      return;
    }
    if (kind === "done") { input.blur(); helper.hidden = true; return; }
    if (kind === "sign") input.value = input.value.startsWith("-") ? input.value.slice(1) : `-${input.value || "0"}`;
    if (kind === "space" && input.type !== "number") {
      const start = input.selectionStart ?? input.value.length;
      input.setRangeText(" ", start, input.selectionEnd ?? start, "end");
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  });
}
