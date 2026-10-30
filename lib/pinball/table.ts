// Playfield layout in table units. The playfield is 400 wide and 760 tall with a
// rounded top; the ball lane (plunger lane) is the strip right of x = 362.
import { vec, type Vec } from "./physics";

export const TABLE_W = 400;
export const TABLE_H = 760;
export const LANE_X = 362;          // inner wall of the plunger lane
export const PLUNGER_X = 381;       // ball resting x in the lane
export const PLUNGER_REST_Y = 700;  // plunger tip when relaxed
export const PLUNGER_PULL = 22;     // how far the tip retracts at full charge
export const ARC_CENTER: Vec = vec(200, 200);
export const ARC_RADIUS = 200;
export const DRAIN_Y = 775;
export const BALL_R = 9;
export const CENTER_X = 181;        // centre of the playfield between the walls
export const FLIPPER_PIVOT_X = 111; // left flipper pivot; the right one mirrors it

// Hot Welcome palette: every role is a shade of electric fuchsia on clear acrylic.
export const COLORS = {
  pink: "#ff00a8", magenta: "#ff00a8", violet: "#ff33b8", cyan: "#ff4dc4",
  amber: "#ff1aaf", lime: "#ff00a8", gold: "#ff00a8", blush: "#ffb3e3", coral: "#ff5cc6",
};

export type Wall = { a: Vec; b: Vec; r: number; e: number; oneWay?: Vec; hidden?: boolean; color?: string };
export type Post = { c: Vec; r: number; e: number; color?: string };
export type Bumper = { id: string; c: Vec; r: number; color: string; hitAt: number };
export type Sling = { id: string; a: Vec; b: Vec; hitAt: number; poly: Vec[]; side: "left" | "right" };
export type Standup = { id: string; a: Vec; b: Vec; hitAt: number; facing: Vec };
export type DropTarget = { id: string; a: Vec; b: Vec; down: boolean; hitAt: number };
export type Flipper = {
  side: "left" | "right"; pivot: Vec; length: number; restAngle: number; activeAngle: number;
  angle: number; angularVel: number; baseR: number; tipR: number; pressed: boolean;
};
export type SensorKind = "lane" | "inlane" | "outlane" | "orbit";
export type Sensor = { id: string; kind: SensorKind; index: number; c: Vec; r: number; inside: boolean; cooldownUntil: number; upOnly?: boolean };
export type LampGroup = "lane" | "letter" | "mult" | "rail" | "orbit" | "bank" | "save" | "inlane" | "standup" | "bumper";
export type Lamp = { id: string; group: LampGroup; index: number; x: number; y: number; r: number; color: string; label?: string };

export type Table = {
  walls: Wall[]; posts: Post[]; bumpers: Bumper[]; slings: Sling[]; standups: Standup[]; drops: DropTarget[];
  flippers: Flipper[]; sensors: Sensor[]; lamps: Lamp[];
  wedges: Vec[][];   // solid filled regions for drawing (inlane/outlane dividers, drop bank island)
};

const mirror = (p: Vec): Vec => vec(LANE_X - p.x, p.y);
const DEG = Math.PI / 180;

export function createTable(): Table {
  const walls: Wall[] = [];
  const posts: Post[] = [];
  const wedges: Vec[][] = [];
  const wall = (a: Vec, b: Vec, r = 2.5, e = 0.55, extra: Partial<Wall> = {}) => walls.push({ a, b, r, e, ...extra });

  // Outer arc from the left wall over the top to the right wall of the plunger lane.
  const arcSteps = 44;
  for (let i = 0; i < arcSteps; i++) {
    const t0 = Math.PI + (Math.PI * i) / arcSteps, t1 = Math.PI + (Math.PI * (i + 1)) / arcSteps;
    wall(vec(ARC_CENTER.x + Math.cos(t0) * ARC_RADIUS, ARC_CENTER.y + Math.sin(t0) * ARC_RADIUS),
      vec(ARC_CENTER.x + Math.cos(t1) * ARC_RADIUS, ARC_CENTER.y + Math.sin(t1) * ARC_RADIUS), 2.5, 0.5, { hidden: true });
  }
  // Side walls.
  wall(vec(0, 200), vec(0, 598), 2.5, 0.5, { hidden: true });
  wall(vec(TABLE_W, 200), vec(TABLE_W, 745), 2.5, 0.5, { hidden: true });
  // Plunger lane: inner wall, one-way gate at its top, and floor.
  wall(vec(LANE_X, 200), vec(LANE_X, 598), 2.5, 0.5, { color: COLORS.violet });
  wall(vec(LANE_X, 80), vec(LANE_X, 200), 1.5, 0.3, { oneWay: vec(-1, 0), color: COLORS.cyan });
  wall(vec(LANE_X, 745), vec(TABLE_W, 745), 2, 0.2, { hidden: true });

  // Lower playfield: outlane slants into the drain, inlane guides onto the flippers.
  const leftPivot = vec(FLIPPER_PIVOT_X, 660), rightPivot = mirror(leftPivot);
  const px = leftPivot.x;
  // Outlane floor: runs under the flipper pivot with clearance for the ball, straight into the drain.
  const slantEnd = vec(px, 716);
  wall(vec(0, 598), slantEnd, 2.5, 0.45, { color: COLORS.pink });
  wall(vec(LANE_X, 598), mirror(slantEnd), 2.5, 0.45, { color: COLORS.pink });
  // The inlane guide is collinear with the flipper's upper surface at rest (32 degrees), ending on the
  // pivot circle, so a ball rolls straight onto the flipper instead of wedging against the pivot.
  const guideEnd = vec(leftPivot.x + Math.sin(32 * DEG) * 11, leftPivot.y - Math.cos(32 * DEG) * 11);
  const guideTop = vec(46, guideEnd.y - (guideEnd.x - 46) * Math.tan(32 * DEG));
  const guidePost = vec(46, 530);
  wall(guidePost, guideTop, 2.5, 0.5, { color: COLORS.violet });
  wall(guideTop, guideEnd, 2.5, 0.45, { color: COLORS.violet });
  wall(mirror(guidePost), mirror(guideTop), 2.5, 0.5, { color: COLORS.violet });
  wall(mirror(guideTop), mirror(guideEnd), 2.5, 0.45, { color: COLORS.violet });
  const apron = [vec(0, 598), slantEnd, vec(px, TABLE_H), vec(0, TABLE_H)];
  wedges.push(apron.map((p) => vec(p.x, p.y)));
  wedges.push(apron.map(mirror));

  // Orbit channels along both side walls, with a deflector at the bottom that returns a
  // descending ball to the playfield instead of dropping it into the outlane.
  wall(vec(44, 250), vec(44, 450), 3, 0.5, { color: COLORS.cyan });
  wall(mirror(vec(44, 250)), mirror(vec(44, 450)), 3, 0.5, { color: COLORS.cyan });
  wall(vec(0, 452), vec(36, 486), 2.5, 0.55, { color: COLORS.cyan });
  wall(mirror(vec(0, 452)), mirror(vec(36, 486)), 2.5, 0.55, { color: COLORS.cyan });

  // Top rollover lanes under the arc.
  for (const x of [127, 163, 199, 235]) wall(vec(x, 58), vec(x, 118), 4, 0.5, { color: COLORS.amber });

  // Slingshots (kicking face is the long diagonal toward the flippers).
  const slingL: Vec[] = [vec(78, 500), vec(78, 592), vec(128, 612)];
  const slingR = slingL.map(mirror);
  const slings: Sling[] = [
    { id: "sling-l", a: slingL[0], b: slingL[2], hitAt: -9, poly: slingL, side: "left" },
    { id: "sling-r", a: slingR[0], b: slingR[2], hitAt: -9, poly: slingR, side: "right" },
  ];
  wall(slingL[0], slingL[1], 2.5, 0.5, { hidden: true }); wall(slingL[1], slingL[2], 2.5, 0.5, { hidden: true });
  wall(slingR[0], slingR[1], 2.5, 0.5, { hidden: true }); wall(slingR[1], slingR[2], 2.5, 0.5, { hidden: true });

  // Pop bumpers.
  const bumpers: Bumper[] = [
    { id: "bumper-1", c: vec(128, 212), r: 22, color: COLORS.pink, hitAt: -9 },
    { id: "bumper-2", c: vec(234, 212), r: 22, color: COLORS.cyan, hitAt: -9 },
    { id: "bumper-3", c: vec(181, 282), r: 22, color: COLORS.violet, hitAt: -9 },
  ];

  // JACKPOT standup targets, flush against the orbit channel walls.
  const standups: Standup[] = [];
  [300, 328, 356].forEach((y, i) => {
    standups.push({ id: `standup-l${i}`, a: vec(52, y), b: vec(52, y + 18), hitAt: -9, facing: vec(1, 0) });
    standups.push({ id: `standup-r${i}`, a: mirror(vec(52, y)), b: mirror(vec(52, y + 18)), hitAt: -9, facing: vec(-1, 0) });
  });

  // Centre drop-target bank with a shallow island behind it.
  const drops: DropTarget[] = [0, 1, 2].map((i) => ({
    id: `drop-${i}`, a: vec(152 + i * 20, 420), b: vec(170 + i * 20, 420), down: false, hitAt: -9,
  }));
  wall(vec(150, 410), vec(212, 410), 2.5, 0.4, { hidden: true });
  wall(vec(150, 410), vec(150, 420), 2.5, 0.4, { hidden: true });
  wall(vec(212, 410), vec(212, 420), 2.5, 0.4, { hidden: true });
  wedges.push([vec(150, 396), vec(212, 396), vec(212, 412), vec(150, 412)]);
  posts.push({ c: vec(150, 420), r: 3, e: 0.6 }, { c: vec(212, 420), r: 3, e: 0.6 });

  // Flippers. Angles are screen-space (y down); positive turns clockwise.
  const flippers: Flipper[] = [
    { side: "left", pivot: leftPivot, length: 60, restAngle: 32 * DEG, activeAngle: -28 * DEG, angle: 32 * DEG, angularVel: 0, baseR: 11, tipR: 6.5, pressed: false },
    { side: "right", pivot: rightPivot, length: 60, restAngle: Math.PI - 32 * DEG, activeAngle: Math.PI + 28 * DEG, angle: Math.PI - 32 * DEG, angularVel: 0, baseR: 11, tipR: 6.5, pressed: false },
  ];

  // Rollover and lane sensors.
  const sensors: Sensor[] = [];
  [145, 181, 217].forEach((x, i) => sensors.push({ id: `lane-${i}`, kind: "lane", index: i, c: vec(x, 92), r: 9, inside: false, cooldownUntil: 0 }));
  sensors.push({ id: "inlane-l", kind: "inlane", index: 0, c: vec(62, 560), r: 10, inside: false, cooldownUntil: 0 });
  sensors.push({ id: "inlane-r", kind: "inlane", index: 1, c: mirror(vec(62, 560)), r: 10, inside: false, cooldownUntil: 0 });
  sensors.push({ id: "outlane-l", kind: "outlane", index: 0, c: vec(22, 575), r: 10, inside: false, cooldownUntil: 0 });
  sensors.push({ id: "outlane-r", kind: "outlane", index: 1, c: mirror(vec(22, 575)), r: 10, inside: false, cooldownUntil: 0 });
  sensors.push({ id: "orbit-l", kind: "orbit", index: 0, c: vec(22, 330), r: 14, inside: false, cooldownUntil: 0, upOnly: true });
  sensors.push({ id: "orbit-r", kind: "orbit", index: 1, c: mirror(vec(22, 330)), r: 14, inside: false, cooldownUntil: 0, upOnly: true });

  // Lamps (visual only).
  const lamps: Lamp[] = [];
  [145, 181, 217].forEach((x, i) => lamps.push({ id: `lane-${i}`, group: "lane", index: i, x, y: 138, r: 7, color: COLORS.amber }));
  "JACKPOT".split("").forEach((ch, i) => lamps.push({ id: `letter-${i}`, group: "letter", index: i, x: CENTER_X + (i - 3) * 27, y: 470, r: 10.5, color: COLORS.gold, label: ch }));
  [2, 3, 4, 5].forEach((m, i) => lamps.push({ id: `mult-${m}`, group: "mult", index: m, x: CENTER_X + (i - 1.5) * 24, y: 522, r: 6.5, color: COLORS.cyan, label: `${m}X` }));
  lamps.push({ id: "bank", group: "bank", index: 0, x: CENTER_X, y: 380, r: 7, color: COLORS.lime, label: "BANK" });
  lamps.push({ id: "save", group: "save", index: 0, x: CENTER_X, y: 598, r: 7, color: COLORS.lime, label: "SAVE" });
  lamps.push({ id: "orbit-l", group: "orbit", index: 0, x: 22, y: 430, r: 7, color: COLORS.cyan });
  lamps.push({ id: "orbit-r", group: "orbit", index: 1, x: LANE_X - 22, y: 430, r: 7, color: COLORS.cyan });
  lamps.push({ id: "inlane-l", group: "inlane", index: 0, x: 62, y: 530, r: 6, color: COLORS.pink });
  lamps.push({ id: "inlane-r", group: "inlane", index: 1, x: LANE_X - 62, y: 530, r: 6, color: COLORS.pink });
  [300, 328, 356].forEach((y, i) => {
    lamps.push({ id: `standup-l${i}`, group: "standup", index: i, x: 74, y: y + 9, r: 4.5, color: COLORS.gold });
    lamps.push({ id: `standup-r${i}`, group: "standup", index: i + 3, x: LANE_X - 74, y: y + 9, r: 4.5, color: COLORS.gold });
  });
  // Decorative rails around the cabinet edge.
  const railCount = 15;
  for (let i = 0; i <= railCount; i++) {
    const t = Math.PI + (Math.PI * i) / railCount;
    lamps.push({ id: `rail-arc-${i}`, group: "rail", index: i, x: ARC_CENTER.x + Math.cos(t) * 214, y: ARC_CENTER.y + Math.sin(t) * 214, r: 4, color: COLORS.magenta });
  }
  for (let i = 0; i < 11; i++) {
    lamps.push({ id: `rail-l-${i}`, group: "rail", index: railCount + 1 + i, x: -14, y: 240 + i * 46, r: 4, color: COLORS.magenta });
    lamps.push({ id: `rail-r-${i}`, group: "rail", index: railCount + 12 + i, x: TABLE_W + 14, y: 240 + i * 46, r: 4, color: COLORS.magenta });
  }

  return { walls, posts, bumpers, slings, standups, drops, flippers, sensors, lamps, wedges };
}
