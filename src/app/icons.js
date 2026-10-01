// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Simple line icons drawn as shop tools. All 24×24, stroke-only so they take currentColor.

const wrap = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

export const ICONS = Object.freeze({
  // end mill: shank + fluted body
  mill: wrap('<path d="M12 2v6"/><path d="M8 8h8l-1 12H9L8 8z"/><path d="M10 10l3 8M14 10l-3 8"/>'),
  // lathe insert / turning tool
  lathe: wrap('<path d="M3 14h9l4-4 5 5v3H3z"/><path d="M3 7h7M3 4h7"/>'),
  // twist drill
  drill: wrap('<path d="M12 2v5"/><path d="M9 7h6l-1 9-2 5-2-5-1-9z"/><path d="M10 10c1 1 3 1 4 0M10 13c1 1 3 1 4 0"/>'),
  // threads: bolt with pitch lines
  thread: wrap('<rect x="9" y="2" width="6" height="4"/><path d="M10 6v15h4V6"/><path d="M10 9h4M10 12h4M10 15h4M10 18h4"/>'),
  // triangle with right angle mark
  geometry: wrap('<path d="M4 20L20 20L4 4z"/><path d="M4 16h4v4"/>'),
  // caliper
  inspect: wrap('<path d="M3 5h18v4H3z"/><path d="M6 9v11M9 9v7M15 9v11M18 9v7"/>'),
  // book
  reference: wrap('<path d="M4 4h7v16H4zM13 4h7v16h-7z"/><path d="M6 8h3M15 8h3"/>'),
  // shop: machine profile / toolbox
  shop: wrap('<rect x="3" y="8" width="18" height="12" rx="1"/><path d="M8 8V5h8v3M3 13h18"/>'),
  search: wrap('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  back: wrap('<path d="M15 5l-7 7 7 7"/>'),
  settings: wrap('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  copy: wrap('<rect x="9" y="9" width="11" height="11" rx="1"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>'),
  star: wrap('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>'),
  starFilled: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" fill="currentColor"/></svg>`,
  warn: wrap('<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/>'),
  backspace: wrap('<path d="M21 6H8l-5 6 5 6h13z"/><path d="m12 9 5 5M17 9l-5 5"/>'),
  down: wrap('<path d="m6 9 6 6 6-6"/>'),
  history: wrap('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>'),
  share: wrap('<path d="M4 12v8h16v-8"/><path d="M12 3v12M8 7l4-4 4 4"/>'),
  more: `<svg viewBox="0 0 24 24" aria-hidden="true" style="fill:currentColor;stroke:none"><circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/></svg>`,
  glove: wrap('<path d="M7 11V5.5a1.5 1.5 0 0 1 3 0V10M10 10V3.5a1.5 1.5 0 0 1 3 0V10M13 10V4.5a1.5 1.5 0 0 1 3 0V11M16 11V7.5a1.5 1.5 0 0 1 3 0V14c0 4-3 7-7 7h-1c-2.5 0-4.5-1.3-5.6-3.3L3.6 14a1.6 1.6 0 0 1 2.7-1.7L7 13.5"/>'),
  help: wrap('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.6a2.4 2.4 0 1 1 3.4 2.2c-.7.3-1 .9-1 1.7M12 17h.01"/>'),
  chevron: wrap('<path d="m9 5 7 7-7 7"/>'),
});

export const CATEGORIES = Object.freeze([
  { id: "mill", name: "Mill", blurb: "End mill speed, feed, cut time" },
  { id: "lathe", name: "Lathe", blurb: "Turning speed, finish, cycle time" },
  { id: "drill", name: "Drill, Tap & Saw", blurb: "Drill speed, tap drills, saw blades" },
  { id: "thread", name: "Threads", blurb: "Sizes, limits, pipe, Acme" },
  { id: "geometry", name: "Geometry", blurb: "Triangles, circles, bolt holes" },
  { id: "inspect", name: "Inspect", blurb: "Position, fits, tolerances" },
  { id: "reference", name: "Reference", blurb: "Charts, materials, G-codes, terms" },
  { id: "shop", name: "Shop", blurb: "Your machines, tools, saved jobs" },
]);
