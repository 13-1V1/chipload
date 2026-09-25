import { spawnSync } from "node:child_process";
const root = new URL("../", import.meta.url);
for (const file of ["app.js","calc-core.js","units.js","ui-state.js","mobile-ui.js","persistence.js","pwa.js","sw.js","serve.mjs"]) {
  const result = spawnSync(process.execPath,["--check",file],{cwd:root,stdio:"inherit"});
  if(result.status !== 0) process.exit(result.status || 1);
}
const result=spawnSync(process.execPath,["--test","core.test.mjs","pages.test.mjs","worker.test.mjs"],{cwd:root,stdio:"inherit"});
process.exit(result.status || 0);
