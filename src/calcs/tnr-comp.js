// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Tool-nose radius comp for chamfers, tapers, and radii — with a G-code snippet. Pro.

import { register } from "../app/registry.js";
import { noseRadiusTaperComp, arcCenterPathRadius } from "../core/lathe.js";
import { fmt, gcodeNumber } from "../core/format.js";
import { toIn } from "./_util.js";
import { noseOptions, chipNoseRadius, chipNoseSpanIn } from "./surface-finish.js";

const isFillet = (r) => r.feature === "radius" && r.convex === "concave";

export default register({
  id: "tnr-comp",
  title: "Nose radius comp & G-code",
  short: "Chamfer / taper / radius offsets without G41-G42, plus a snippet",
  help: "A lathe tool's nose is round, not a point. This gives the shifts to program a chamfer or taper without G41/G42, and a snippet with it. Pick outside (OD) or a bore (ID): the shift, the comp side and the tip number all flip.",
  category: "lathe",
  keywords: ["tool nose", "tnr", "nose radius", "compensation", "g41", "g42", "chamfer", "taper", "radius", "g02", "g03", "lathe g-code"],
  pro: true,
  safety: "G-code is a starting point. Simulate, single-block, and dry run above the part.",
  inputs: [
    { id: "feature", label: "Feature", kind: "segment", default: "chamfer", options: [{ value: "chamfer", label: "Chamfer / taper" }, { value: "radius", label: "Radius" }] },
    { id: "side", label: "Cutting", kind: "segment", default: "od", options: [{ value: "od", label: "Outside (OD)" }, { value: "id", label: "Bore (ID)" }] },
    // Labeled in the units on screen (0.8 mm / 1/32"), so the chip picked is the radius the answer uses.
    { id: "nose", label: "Nose radius", kind: "segment", default: "0.0312", options: (raw, c) => noseOptions(c?.units) },
    { id: "noseCustom", label: "Nose radius", kind: "length", default: "0.0312", defaultMm: "0.8", min: 0.0001, showIf: (r) => r.nose === "custom" },
    { id: "angle", label: "Angle from the Z axis (centerline)", kind: "angle", default: "45", min: 0.1, max: 89.9, showIf: (r) => r.feature === "chamfer", hint: "45° chamfer = 45. A 30° chamfer callout off the face = 60 here." },
    { id: "size", label: "Chamfer size (axial, Z)", kind: "length", default: "0.05", defaultMm: "1", min: 0, showIf: (r) => r.feature === "chamfer" },
    { id: "radius", label: "Part radius", kind: "length", default: "0.125", defaultMm: "3", min: 0.0001, showIf: (r) => r.feature === "radius" },
    { id: "convex", label: "Radius is", kind: "segment", default: "convex", options: [{ value: "convex", label: "Rounded corner" }, { value: "concave", label: "Fillet at a step" }], showIf: (r) => r.feature === "radius",
      hint: "Rounded corner: the face meets the diameter. Fillet: the cut runs toward the chuck into a shoulder (OD) or a smaller bore (ID)." },
    { id: "dia", advanced: true, label: (r) => (r.side === "id" ? (isFillet(r) ? "Bore diameter before the step" : "Bore diameter") : (isFillet(r) ? "Diameter before the shoulder" : "Finished diameter")), kind: "length", default: "1", defaultMm: "25", min: 0 },
    { id: "z", advanced: true, label: (r) => (isFillet(r) ? "Z of the shoulder face" : "Z of the front face"), kind: "length", default: "0" },
    { id: "feed", advanced: true, label: "Feed per rev", kind: "feedRev", default: "0.006", defaultMm: "0.15", min: 0 },
  ],
  compute(v, c) {
    const id = v.side === "id";
    const r = v.nose === "custom" ? v.noseCustom : chipNoseRadius(v.nose, c.units); // 1/32 in, or 0.8 mm on a metric screen
    const dp = c.units === "in" ? 4 : 3;
    const u = c.L.length, U = c.units === "in" ? "IN" : "MM";
    const F = gcodeNumber(v.feed, 4);
    const G = (n) => gcodeNumber(n, dp);
    // approach and run-off distances for the snippet, in the working unit
    const lead = c.units === "in" ? 0.1 : 2.5, runOff = c.units === "in" ? 0.2 : 5;
    // Snippets are written in the Fanuc/Haas lathe view: X (diameter) up, Z right, toward the chuck is −Z.
    // G2 is clockwise in that view; G41/G42 is the tool left/right of the path looking along the travel.
    // Front- and rear-turret machines run the same text. Toward the chuck an OD tool (tip 3) takes G42 and a
    // boring bar (tip 2) takes G41 (Haas Lathe Programming Workbook, tool nose compensation). A bore is the
    // OD mirrored about the finished diameter, so every X offset, arc word and comp word flips with it.
    const out = id ? -1 : 1; // from the finished diameter toward air: +X on an OD, −X in a bore
    const S = id ? "ID" : "OD", comp = id ? "G41" : "G42", tip = id ? 2 : 3;
    // Off a bore wall toward the centerline: one lead of room, never past half the bore.
    const clearOf = (d) => Math.max(d - 2 * lead, d / 2);
    // In a bore the tool backs out in Z before anything else moves.
    const backOut = (zSafe) => (id ? [`G0 Z${G(zSafe)}`] : []);
    const offsetLine = `(R OFFSET ${G(r)} ${U} TIP ${tip})`;
    if (id && !(v.dia > 0)) throw new Error("Enter the bore diameter");
    if (v.feature === "chamfer") {
      const tnc = noseRadiusTaperComp({ noseRadius: r, angleFromZ: v.angle });
      const dz = v.size; // axial length of chamfer
      const dxRad = dz * Math.tan(v.angle * Math.PI / 180); // radial
      const xFace = v.dia - out * 2 * dxRad; // diameter where the chamfer meets the face
      // Imaginary-tip program (compensated by hand): start on the face early, end on the diameter late.
      const xStart = xFace - out * 2 * tnc.dx;
      const zEnd = v.z - dz - tnc.dz;
      if (xFace < 0 || xStart < 0) throw new Error("That chamfer is bigger than the part — check the diameter it starts from");
      const manual = [
        `(${S} CHAMFER ${G(dz)} X ${gcodeNumber(v.angle, 1)} DEG)`,
        "(TIP PROGRAMMED - COMP BY HAND)",
        `(NOSE R ${G(r)} ${U} TIP ${tip})`,
        "(FEED PER REV - G99 ON FANUC/HAAS)",
        `G0 X${G(xStart)} Z${G(v.z + lead)}`,
        `G1 Z${G(v.z)} F${F}`,
        `G1 X${G(v.dia)} Z${G(zEnd)}`,
        `G1 Z${G(zEnd - runOff)}`,
        `G0 X${G(id ? clearOf(v.dia) : v.dia + runOff)}`,
        ...backOut(v.z + lead),
      ].join("\n");
      const withComp = [
        `(${S} CHAMFER WITH ${comp})`,
        offsetLine,
        `G0 X${G(xFace)} Z${G(v.z + lead)}`,
        `${comp} G1 Z${G(v.z)} F${F}`,
        `G1 X${G(v.dia)} Z${G(v.z - dz)}`,
        `G1 Z${G(v.z - dz - runOff)}`,
        `G40 G0 X${G(id ? clearOf(v.dia) : v.dia + runOff)}`,
        ...backOut(v.z + lead),
      ].join("\n");
      return {
        primary: { label: "Z shift at the diameter end", value: tnc.dz, unit: u, places: dp },
        stats: [
          { label: "X shift at the face end (radius)", value: tnc.dx, unit: u, places: dp },
          { label: "Same on diameter", value: tnc.dx * 2, unit: u, places: dp },
          { label: "Error if not compensated", value: tnc.error, unit: u, places: dp, clamped: toIn(tnc.error, c.units) > 0.0005 },
          { label: "Radial size of chamfer", value: dxRad, unit: u, places: dp },
        ],
        code: [{ title: "Tip-programmed (no G41/G42)", text: manual, pro: true, filename: "chamfer-tip.nc" }, { title: `With ${comp}`, text: withComp, pro: true, filename: `chamfer-${comp.toLowerCase()}.nc` }],
        source: "gcode",
        explain: [
          { title: "Nose radius comp", formula: "ΔZ = r (1 − tan(θ/2))   ΔX = r (1 − tan((90° − θ)/2))", plugged: `r = ${fmt(r, dp)} ${u}, θ = ${fmt(v.angle, 1)}° → ΔZ ${fmt(tnc.dz, dp)} ${u}, ΔX ${fmt(tnc.dx, dp)} ${u}` },
          { title: "Surface error without comp", formula: "e = r (sin θ + cos θ − 1)", plugged: `= ${fmt(tnc.error, dp)} ${u}` },
        ],
        notes: [`The imaginary tip cuts faces and diameters right, but leaves e of extra material on a chamfer or taper, so ${id ? "the bore comes out undersize" : "the OD comes out oversize"}. Shifting the endpoints fixes it; ${comp} does the same thing automatically.`],
        historyLabel: `${S} ${fmt(v.angle, 0)}° chamfer · r ${fmt(r, dp)} ${u}`,
      };
    }
    const convex = v.convex === "convex";
    const R = v.radius;
    const pathR = arcCenterPathRadius({ radius: R, noseRadius: r, convex });
    // Within a tenth (0.0001 in) the fillet and the nose are the same size: prints write a 1/32 nose as 0.0312, and a
    // near-zero center path is not a real G41/G42 arc. A chip is one insert in both systems (ISO 16 = ANSI 1/16, 0.0005 in
    // apart), so a fillet anywhere from its inch fraction to its metric size, a tenth either side, is the nose's size too.
    const [noseLo, noseHi] = v.nose === "custom" ? [toIn(r, c.units), toIn(r, c.units)] : chipNoseSpanIn(v.nose);
    const filletIn = toIn(R, c.units);
    if (!convex && filletIn >= noseLo - 0.0001 && filletIn <= noseHi + 0.0001) throw new Error("The fillet is the same size as the nose radius — form it with the nose and no comp, or use a smaller nose for G41/G42");
    if (pathR < 0) throw new Error("Nose radius is bigger than the fillet — it can't cut it. Use a smaller nose");
    if (!id && convex && v.dia - 2 * R < 0) throw new Error("That radius is bigger than the part — check the diameter it starts from");
    if (id && !convex && v.dia - 2 * R <= 0) throw new Error("That fillet steps down past the centerline — check the bore diameter");
    const snippet = [`(${S} ${convex ? "CORNER" : "FILLET"} R ${G(R)} ${U} WITH ${comp})`, offsetLine, ...(convex
      ? [
        `G0 X${G(v.dia - out * 2 * R)} Z${G(v.z + lead)}`,
        `${comp} G1 Z${G(v.z)} F${F}`,
        // face round to the diameter, center in the metal: counter-clockwise on an OD, clockwise in a bore
        `${id ? "G2" : "G3"} X${G(v.dia)} Z${G(v.z - R)} R${G(R)}`,
        `G1 Z${G(v.z - R - runOff)}`,
        `G40 G0 X${G(id ? clearOf(v.dia) : v.dia + runOff)}`,
        ...backOut(v.z + lead),
      ]
      : [
        // along the diameter toward the chuck, then into the step: center in the air, clockwise on an OD.
        // In a bore the entry point can be deep inside the part, so line up on the bore first, then go in.
        ...(id
          ? ["(START IN FRONT OF THE BORE)", `G0 X${G(clearOf(v.dia))}`, `G0 Z${G(v.z + R + lead)}`]
          : [`G0 X${G(v.dia + 2 * lead)} Z${G(v.z + R + lead)}`]),
        `${comp} G1 X${G(v.dia)} F${F}`,
        `G1 Z${G(v.z + R)}`,
        `${id ? "G3" : "G2"} X${G(v.dia + out * 2 * R)} Z${G(v.z)} R${G(R)}`,
        `G1 X${G(id ? clearOf(v.dia - 2 * R) : v.dia + 2 * R + runOff)}`,
        `G40 G0 Z${G(v.z + R + lead)}`,
        ...(id ? ["(BACK OUT IN Z BEFORE ANY X MOVE)"] : []),
      ])].join("\n");
    return {
      primary: { label: "Nose-center path radius", value: pathR, unit: u, places: dp },
      stats: [
        { label: "Part radius", value: R, unit: u, places: dp },
        { label: "Nose radius", value: r, unit: u, places: dp },
        { label: "Without comp, the arc comes out", text: `${convex ? "smaller" : "larger"} by up to ${fmt(r * 0.4142, dp)} ${u} at 45°` },
      ],
      code: [{ title: `${S} ${convex ? "rounded corner" : "fillet"} with ${comp}`, text: snippet, pro: true, filename: "radius.nc" }],
      source: "gcode",
      explain: [{ title: "Center path", formula: convex ? "Rpath = R + r" : "Rpath = R − r", plugged: `= ${fmt(R, dp)} ${convex ? "+" : "−"} ${fmt(r, dp)} = ${fmt(pathR, dp)} ${u}` }],
      notes: [
        "Use G41/G42 for arcs. Tip-programming an arc without comp needs the endpoints shifted the same way as a chamfer — every point along the arc is a different angle.",
        "Arcs are written the Fanuc/Haas way (X up, toward the chuck is Z minus). Front- and rear-turret lathes run the same program.",
      ],
      historyLabel: `${S} ${convex ? "corner" : "fillet"} R${fmt(R, dp)} ${u} · r ${fmt(r, dp)} ${u}`,
    };
  },
});
