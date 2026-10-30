// Add or rename games here; the home page and game routes share this registry.
// Set ready: true once a game has its own route under app/games/<slug>/.
export const games = [
  { slug: "game-1", title: "<game 1>", ready: false, blurb: "A new game is on its way." },
  { slug: "game-2", title: "Pinball", ready: true, blurb: "Three balls, flashing lights, and a JACKPOT to spell." },
  { slug: "game-3", title: "<game 3>", ready: false, blurb: "A new game is on its way." },
] as const;
