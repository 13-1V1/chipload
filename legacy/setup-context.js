// Portable calculation settings. These records never replace the local shop library.
export function readSetupContext(serialized) {
  if (typeof serialized !== "string" || serialized.length > 12000) throw new Error("Invalid saved setup.");
  const value = JSON.parse(serialized);
  const fail = () => { throw new Error("This setup has invalid or unsupported settings. Ask for a new link."); };
  const text = v => typeof v === "string" && v.length > 0 && v.length <= 300;
  const number = (v, min = 0) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= 1e12;
  if (!value || value.version !== 1 || !text(value.calculatorVersion)) fail();
  let machine = null;
  if (value.machine !== null) {
    const m = value.machine;
    if (!m || !text(m.name) || !["in", "mm"].includes(m.units) || !number(m.maxRpm) || !number(m.maxFeed)
      || !["fanuc", "haas", "linuxcnc", "mach3", "generic"].includes(m.controller)
      || !/^G5[4-9]$/.test(m.workOffset) || !number(m.safeZ, -1e12)) fail();
    machine = { name: m.name, units: m.units, maxRpm: m.maxRpm, maxFeed: m.maxFeed,
      controller: m.controller, workOffset: m.workOffset, safeZ: m.safeZ };
  }
  let material = null;
  if (value.material !== null) {
    const m = value.material;
    if (!m || !text(m.id) || !text(m.name) || !number(m.sfm) || !number(m.chipIn)) fail();
    material = { id: m.id, name: m.name, sfm: m.sfm, chipIn: m.chipIn };
  }
  return { version: 1, calculatorVersion: value.calculatorVersion, machine, material };
}
