// Add or rename games here; the home page and game routes share this registry.
// Give a game a `blurb` once it is playable; the home card then shows it instead of "Coming soon".
export const games = [
  { slug: "game-1", title: "Confetti Chase", blurb: "Collect the confetti, dodge your teammates." },
  { slug: "game-2", title: "<game 2>" },
  { slug: "game-3", title: "<game 3>" },
] as const;
