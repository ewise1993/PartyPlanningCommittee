// Shared catalogue order; add a blurb when a game is playable.
export const games: ReadonlyArray<{slug:string;title:string;blurb?:string}> = [
  { slug: "game-1", title: "Confetti Chase", blurb: "Collect the confetti, dodge your teammates." },
  { slug: "game-2", title: "Pinball", blurb: "Three balls, fuchsia lights, and a JACKPOT to spell." },
  { slug: "traffic-jam", title: "Traffic Jam", blurb: "Slide the cars. Clear your way out." },
];
