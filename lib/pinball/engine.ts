// Game rules and simulation. Pure TypeScript; the React component drives update()
// from requestAnimationFrame and the renderer reads public state.
import { applyFriction, clampSpeed, collideCapsule, collideCircle, collideFlipper, flipperSurfaceVelocity, stepFlipper, vec, type Ball, type Vec } from "./physics";
import {
  BALL_R, DRAIN_Y, LANE_X, PLUNGER_PULL, PLUNGER_REST_Y, PLUNGER_X, TABLE_W, createTable, type Flipper, type Table,
} from "./table";

export type Phase = "attract" | "ready" | "play" | "drain" | "over";

export type GameEvent =
  | { type: "start" }
  | { type: "launch"; power: number }
  | { type: "flipper"; side: "left" | "right"; pressed: boolean }
  | { type: "bumper"; id: string; x: number; y: number; points: number }
  | { type: "sling"; id: string; x: number; y: number; points: number }
  | { type: "target"; id: string; x: number; y: number; points: number }
  | { type: "drop"; id: string; x: number; y: number; points: number }
  | { type: "bank"; points: number }
  | { type: "lane"; index: number; x: number; y: number; points: number }
  | { type: "inlane"; x: number; y: number; points: number }
  | { type: "outlane"; x: number; y: number; points: number }
  | { type: "orbit"; x: number; y: number; points: number }
  | { type: "letter"; index: number }
  | { type: "jackpot"; points: number }
  | { type: "multiplier"; value: number }
  | { type: "combo"; count: number; x: number; y: number }
  | { type: "ballsave" }
  | { type: "drain"; bonus: number }
  | { type: "nudge" }
  | { type: "newball"; number: number }
  | { type: "gameover"; score: number; newHigh: boolean; tickets: number }
  | { type: "highscore" };

export const BALLS_PER_GAME = 3;
export const HIGH_SCORE_KEY = "hot-welcome-arcade:pinball-high-score";
const GRAVITY = 1350;
const DAMPING = 0.1;
const MAX_SPEED = 1500;
const PHYS_DT = 1 / 480;
const BALL_SAVE_SECONDS = 5;
const COMBO_WINDOW = 2;
const PLUNGER_FACE = vec(0, -1);
const SCORE = { bumper: 100, sling: 50, lane: 300, inlane: 250, outlane: 1000, target: 750, drop: 500, bank: 5000, orbit: 1500, lanesComplete: 2000, jackpot: 50000 };

export function ticketsForScore(score: number) { return Math.max(0, Math.min(500, Math.floor(score / 1500))); }

export class PinballEngine {
  table: Table = createTable();
  ball: Ball | null = null;
  phase: Phase = "attract";
  time = 0;
  score = 0;
  highScore = 0;
  newHigh = false;
  ballNumber = 0;
  multiplier = 1;
  letters: boolean[] = Array(7).fill(false);
  lanes: boolean[] = [false, false, false];
  combo = 0;
  lastHitAt = -99;
  charge = 0;
  charging = false;
  recoiling = false;
  jackpotUntil = 0;
  saveUntil = 0;
  drainUntil = 0;
  dropResetAt = 0;
  autoLaunchAt = 0;
  launchedAt = -99;
  leftLane = false;
  lastBonus = 0;
  ticketsAwarded = 0;
  events: GameEvent[] = [];
  private slowTime = 0;
  private anchor: Vec = vec(0, 0);

  constructor() {
    try {
      const stored = Number(globalThis.localStorage?.getItem(HIGH_SCORE_KEY) ?? 0);
      if (Number.isFinite(stored) && stored > 0) this.highScore = Math.floor(stored);
    } catch { /* storage unavailable; high score stays in memory */ }
    this.spawnBall();
  }

  get plungerY() { return PLUNGER_REST_Y + this.charge * PLUNGER_PULL; }
  get ballInLane() { return !!this.ball && this.ball.pos.x > LANE_X; }
  get ballSaveActive() { return this.phase === "play" && this.time < this.saveUntil; }
  get jackpotCelebrating() { return this.time < this.jackpotUntil; }

  /** Pull and clear the queued events. */
  drainEvents() { const out = this.events; this.events = []; return out; }

  start() {
    if (this.phase !== "attract" && this.phase !== "over") return;
    this.score = 0; this.newHigh = false; this.ballNumber = 1; this.multiplier = 1; this.combo = 0;
    this.letters.fill(false); this.lanes.fill(false); this.ticketsAwarded = 0; this.jackpotUntil = 0; this.saveUntil = 0;
    for (const d of this.table.drops) d.down = false;
    this.spawnBall();
    this.phase = "ready";
    this.events.push({ type: "start" }, { type: "newball", number: 1 });
  }

  pressLaunch() { if (this.phase === "ready") { this.charging = true; } }
  releaseLaunch() {
    if (!this.charging) return;
    this.charging = false;
    if (this.phase === "ready") this.launch(Math.max(0.3, this.charge));
    this.recoiling = true;
  }
  private launch(power: number) {
    if (!this.ball) return;
    this.ball.vel = vec(0, -(600 + power * 1100));
    this.phase = "play";
    this.launchedAt = this.time;
    this.leftLane = false;
    this.slowTime = 0;
    this.events.push({ type: "launch", power });
  }

  setFlipper(side: "left" | "right", pressed: boolean) {
    const f = this.table.flippers.find((fl) => fl.side === side)!;
    if (f.pressed === pressed) return;
    f.pressed = pressed;
    if (this.phase === "play" || this.phase === "ready") {
      this.events.push({ type: "flipper", side, pressed });
      if (pressed && this.phase === "play") this.rotateLanes(side);
    }
  }

  private rotateLanes(side: "left" | "right") {
    const l = this.lanes;
    if (side === "left") this.lanes = [l[1], l[2], l[0]]; else this.lanes = [l[2], l[0], l[1]];
  }

  private spawnBall() {
    this.ball = { pos: vec(PLUNGER_X, this.plungerY - BALL_R - 0.5), vel: vec(0, 0), r: BALL_R };
  }

  private award(base: number, x?: number, y?: number, countsForCombo = true): number {
    let points = base * this.multiplier;
    if (countsForCombo) {
      this.combo = this.time - this.lastHitAt < COMBO_WINDOW ? this.combo + 1 : 1;
      this.lastHitAt = this.time;
      if (this.combo >= 2) points += (this.combo - 1) * 25 * this.multiplier;
      if (this.combo >= 3 && x !== undefined && y !== undefined) this.events.push({ type: "combo", count: this.combo, x, y });
    }
    this.addScore(points);
    return points;
  }

  private addScore(points: number) {
    this.score += points;
    if (this.score > this.highScore) {
      if (!this.newHigh && this.highScore > 0) this.events.push({ type: "highscore" });
      this.newHigh = true;
      this.highScore = this.score;
    }
  }

  private lightLetter() {
    const idx = this.letters.indexOf(false);
    if (idx < 0 || this.jackpotCelebrating) return;
    this.letters[idx] = true;
    this.events.push({ type: "letter", index: idx });
    if (this.letters.every(Boolean)) {
      const points = SCORE.jackpot * this.multiplier;
      this.addScore(points);
      this.jackpotUntil = this.time + 3;
      this.events.push({ type: "jackpot", points });
    }
  }

  private nextBallOrEnd() {
    this.multiplier = 1;
    this.lanes.fill(false);
    this.combo = 0;
    for (const d of this.table.drops) d.down = false;
    if (this.ballNumber >= BALLS_PER_GAME) {
      this.phase = "over";
      this.ball = null;
      this.ticketsAwarded = ticketsForScore(this.score);
      try { if (this.newHigh) globalThis.localStorage?.setItem(HIGH_SCORE_KEY, String(this.highScore)); } catch { /* ignore */ }
      this.events.push({ type: "gameover", score: this.score, newHigh: this.newHigh, tickets: this.ticketsAwarded });
      return;
    }
    this.ballNumber += 1;
    this.spawnBall();
    this.phase = "ready";
    this.events.push({ type: "newball", number: this.ballNumber });
  }

  update(frameDt: number) {
    const dtFrame = Math.min(frameDt, 1 / 30);
    this.time += dtFrame;
    if (this.charging && this.phase === "ready") this.charge = Math.min(1, this.charge + dtFrame / 1.1);
    else if (this.recoiling) { this.charge = Math.max(0, this.charge - dtFrame * 14); if (this.charge === 0) this.recoiling = false; }
    if (this.jackpotUntil && this.time >= this.jackpotUntil) { this.jackpotUntil = 0; this.letters.fill(false); }
    if (this.dropResetAt && this.time >= this.dropResetAt) { this.dropResetAt = 0; for (const d of this.table.drops) d.down = false; }
    if (this.time - this.lastHitAt > COMBO_WINDOW) this.combo = 0;
    if (this.phase === "drain" && this.time >= this.drainUntil) this.nextBallOrEnd();
    if (this.autoLaunchAt && this.time >= this.autoLaunchAt) { this.autoLaunchAt = 0; if (this.phase === "ready") this.launch(0.85); }

    const steps = Math.max(1, Math.ceil(dtFrame / PHYS_DT));
    const dt = dtFrame / steps;
    for (let i = 0; i < steps; i++) {
      for (const f of this.table.flippers) {
        const active = f.pressed && (this.phase === "play" || this.phase === "ready");
        stepFlipper(f, active ? f.activeAngle : f.restAngle, active ? 26 : 16, dt);
      }
      if (this.ball && (this.phase === "play" || this.phase === "ready")) this.stepBall(dt);
    }
  }

  private stepBall(dt: number) {
    const ball = this.ball!;
    const t = this.table;
    ball.vel.y += GRAVITY * dt;
    const damp = 1 - DAMPING * dt;
    ball.vel.x *= damp; ball.vel.y *= damp;
    ball.pos.x += ball.vel.x * dt; ball.pos.y += ball.vel.y * dt;

    for (let iter = 0; iter < 2; iter++) {
      for (const w of t.walls) { const c = collideCapsule(ball, w.a, w.b, w.r, w.r, w.e, undefined, w.oneWay); if (c && iter === 0) applyFriction(ball, c.n, dt); }
      for (const p of t.posts) collideCircle(ball, p.c, p.r, p.e);
      // Plunger tip is a moving one-way floor: it carries the ball from above and springs back beneath a launched ball.
      if (ball.pos.x > LANE_X - BALL_R) collideCapsule(ball, vec(LANE_X, this.plungerY), vec(TABLE_W, this.plungerY), 0, 0, 0.15, undefined, PLUNGER_FACE);
      for (const f of t.flippers) {
        const c = collideFlipper(ball, f, 0.35);
        // Rubber grips: the ball follows a moving flipper instead of skidding along it.
        if (c && iter === 0) applyFriction(ball, c.n, dt, 6, flipperSurfaceVelocity(f)(c.point));
      }
      if (iter === 0) this.collideScoringObjects(ball);
    }
    clampSpeed(ball, MAX_SPEED);
    this.checkSensors(ball);

    if (this.phase === "play") {
      if (!this.leftLane && ball.pos.x < LANE_X - BALL_R) { this.leftLane = true; this.saveUntil = this.time + BALL_SAVE_SECONDS; }
      // A weak launch rolls back onto the plunger: allow another launch.
      if (!this.leftLane && ball.pos.x > LANE_X && ball.pos.y > this.plungerY - 40 && Math.hypot(ball.vel.x, ball.vel.y) < 25 && this.time - this.launchedAt > 0.8) {
        this.phase = "ready";
      }
      // Stuck watchdog: a ball that has not travelled anywhere for a while gets a nudge.
      if (Math.hypot(ball.pos.x - this.anchor.x, ball.pos.y - this.anchor.y) > 12 || ball.pos.x > LANE_X) { this.anchor = vec(ball.pos.x, ball.pos.y); this.slowTime = 0; }
      else this.slowTime += dt;
      if (this.slowTime > 2.5) {
        this.slowTime = 0;
        ball.vel.x += (ball.pos.x < 181 ? 1 : -1) * (120 + Math.random() * 160); ball.vel.y = Math.min(ball.vel.y, 0) - 420;
        this.events.push({ type: "nudge" });
      }
      if (ball.pos.y > DRAIN_Y) this.onDrain();
      else if (ball.pos.x < -30 || ball.pos.x > TABLE_W + 30 || ball.pos.y < -40) { this.spawnBall(); this.phase = "ready"; }
    }
  }

  private collideScoringObjects(ball: Ball) {
    const t = this.table;
    for (const b of t.bumpers) {
      const c = collideCircle(ball, b.c, b.r, 0.6);
      if (c && this.time - b.hitAt > 0.08) {
        b.hitAt = this.time;
        ball.vel.x += c.n.x * 380; ball.vel.y += c.n.y * 380;
        const points = this.award(SCORE.bumper, b.c.x, b.c.y);
        this.events.push({ type: "bumper", id: b.id, x: c.point.x + c.n.x * b.r, y: c.point.y + c.n.y * b.r, points });
      }
    }
    for (const s of t.slings) {
      const c = collideCapsule(ball, s.a, s.b, 2.5, 2.5, 0.5);
      if (c && c.approach > 60 && this.time - s.hitAt > 0.15) {
        s.hitAt = this.time;
        ball.vel.x += c.n.x * 480; ball.vel.y += c.n.y * 480;
        const points = this.award(SCORE.sling, c.point.x, c.point.y);
        this.events.push({ type: "sling", id: s.id, x: c.point.x, y: c.point.y, points });
      }
    }
    for (const s of t.standups) {
      const c = collideCapsule(ball, s.a, s.b, 3, 3, 0.5);
      if (c && c.approach > 30 && this.time - s.hitAt > 0.25) {
        s.hitAt = this.time;
        const points = this.award(SCORE.target, c.point.x, c.point.y);
        this.events.push({ type: "target", id: s.id, x: c.point.x, y: c.point.y, points });
        this.lightLetter();
      }
    }
    for (const d of t.drops) {
      if (d.down) continue;
      const c = collideCapsule(ball, d.a, d.b, 3, 3, 0.3);
      if (c && c.approach > 20) {
        d.down = true; d.hitAt = this.time;
        const points = this.award(SCORE.drop, c.point.x, c.point.y);
        this.events.push({ type: "drop", id: d.id, x: c.point.x, y: c.point.y, points });
        if (t.drops.every((x) => x.down)) {
          const bonus = this.award(SCORE.bank, undefined, undefined, false);
          this.dropResetAt = this.time + 1.4;
          this.events.push({ type: "bank", points: bonus });
          this.lightLetter();
        }
      }
    }
  }

  private checkSensors(ball: Ball) {
    for (const s of this.table.sensors) {
      const inside = Math.hypot(ball.pos.x - s.c.x, ball.pos.y - s.c.y) < s.r + ball.r * 0.5;
      const entered = inside && !s.inside;
      s.inside = inside;
      if (!entered || this.time < s.cooldownUntil || this.phase !== "play") continue;
      if (s.upOnly && ball.vel.y > -120) continue;
      s.cooldownUntil = this.time + 0.4;
      switch (s.kind) {
        case "lane": {
          const points = this.award(SCORE.lane, s.c.x, s.c.y);
          this.lanes[s.index] = true;
          this.events.push({ type: "lane", index: s.index, x: s.c.x, y: s.c.y, points });
          if (this.lanes.every(Boolean)) {
            this.lanes.fill(false);
            this.multiplier = Math.min(5, this.multiplier + 1);
            this.award(SCORE.lanesComplete, undefined, undefined, false);
            this.events.push({ type: "multiplier", value: this.multiplier });
          }
          break;
        }
        case "inlane": this.events.push({ type: "inlane", x: s.c.x, y: s.c.y, points: this.award(SCORE.inlane, s.c.x, s.c.y) }); break;
        case "outlane": this.events.push({ type: "outlane", x: s.c.x, y: s.c.y, points: this.award(SCORE.outlane, undefined, undefined, false) }); break;
        case "orbit": {
          const points = this.award(SCORE.orbit, s.c.x, s.c.y);
          this.events.push({ type: "orbit", x: s.c.x, y: s.c.y, points });
          this.lightLetter();
          break;
        }
      }
    }
  }

  private onDrain() {
    if (this.ballSaveActive) {
      this.saveUntil = 0;
      this.spawnBall();
      this.phase = "ready";
      this.autoLaunchAt = this.time + 0.7;
      this.events.push({ type: "ballsave" });
      return;
    }
    const bonus = (this.letters.filter(Boolean).length * 1000 + this.lanes.filter(Boolean).length * 500) * this.multiplier;
    this.lastBonus = bonus;
    this.addScore(bonus);
    this.ball = null;
    this.phase = "drain";
    this.drainUntil = this.time + 1.5;
    this.events.push({ type: "drain", bonus });
  }
}
