// Canvas renderer: a static playfield layer plus per-frame lamps, targets, flippers,
// chrome ball, particles and messages. Works in table units scaled to the canvas.
import { flipperTip } from "./physics";
import type { GameEvent, PinballEngine } from "./engine";
import { ARC_CENTER, ARC_RADIUS, CENTER_X, COLORS, FLIPPER_PIVOT_X, LANE_X, PLUNGER_X, TABLE_H, TABLE_W, type Lamp, type Table } from "./table";

export const VIEW_W = 440;
export const VIEW_H = 800;
const OX = 20, OY = 20;

type Spark = { x: number; y: number; vx: number; vy: number; life: number; total: number; color: string; size: number; confetti: boolean; rot: number; spin: number };
type Ring = { x: number; y: number; r: number; maxR: number; life: number; total: number; color: string; width: number };
type Popup = { x: number; y: number; text: string; life: number; total: number; color: string; size: number };
type Message = { text: string; sub?: string; life: number; total: number; color: string };
type Ripple = { x: number; y: number; t: number; amp: number };

const PALETTE = [COLORS.pink, COLORS.magenta, COLORS.violet, COLORS.cyan, COLORS.amber, COLORS.lime, COLORS.gold, COLORS.white];
const fmt = (n: number) => n.toLocaleString("en-US");

export class PinballRenderer {
  private ctx: CanvasRenderingContext2D;
  private scale = 1;
  private staticLayer: HTMLCanvasElement | null = null;
  private staticKey = "";
  private font = "sans-serif";
  private clock = 0;
  private intensity = new Map<string, number>();
  private boost = new Map<string, number>();
  private sparks: Spark[] = [];
  private rings: Ring[] = [];
  private popups: Popup[] = [];
  private ripples: Ripple[] = [];
  private message: Message | null = null;
  private flash = 0;
  private flashColor = COLORS.white;
  private shake = 0;
  private trail: { x: number; y: number }[] = [];
  private glowCache = new Map<string, HTMLCanvasElement>();
  private reducedMotion = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    try { this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* ignore */ }
  }

  setFont(family: string) { this.font = family; this.staticKey = ""; }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.scale = Math.min(w / VIEW_W, h / VIEW_H);
  }

  // ---------------------------------------------------------------- events
  handleEvents(events: GameEvent[], engine: PinballEngine) {
    const t = engine.table;
    for (const e of events) {
      switch (e.type) {
        case "bumper": {
          const b = t.bumpers.find((x) => x.id === e.id)!;
          this.burst(e.x, e.y, 14, [b.color, COLORS.white], 260);
          this.ring(b.c.x, b.c.y, b.r, b.r + 34, b.color, 0.35);
          this.popup(e.x, e.y, `+${fmt(e.points)}`, COLORS.white, 13);
          this.ripples.push({ x: b.c.x, y: b.c.y, t: this.clock, amp: 0.5 });
          break;
        }
        case "sling": this.burst(e.x, e.y, 9, [COLORS.pink, COLORS.white], 220); this.popup(e.x, e.y, `+${fmt(e.points)}`, COLORS.pink, 12); break;
        case "target": {
          this.burst(e.x, e.y, 12, [COLORS.gold, COLORS.amber, COLORS.white], 240);
          this.popup(e.x + (e.x < CENTER_X ? 18 : -18), e.y, `+${fmt(e.points)}`, COLORS.gold, 13);
          const idx = e.id.startsWith("standup-l") ? Number(e.id.slice(-1)) : Number(e.id.slice(-1)) + 3;
          this.boost.set(`standup-${e.id.slice(8)}`, 1); this.boost.set(`standup-idx-${idx}`, 1);
          break;
        }
        case "drop": this.burst(e.x, e.y, 10, [COLORS.lime, COLORS.white], 220); this.popup(e.x, e.y - 6, `+${fmt(e.points)}`, COLORS.lime, 13); break;
        case "bank": this.say("BANK CLEARED", `+${fmt(e.points)}`, COLORS.lime, 1.6); this.flashScreen(0.35, COLORS.lime); this.ripples.push({ x: CENTER_X, y: 410, t: this.clock, amp: 1 }); this.boost.set("bank", 1); break;
        case "lane": this.popup(e.x, e.y + 30, `+${fmt(e.points)}`, COLORS.amber, 12); this.boost.set(`lane-${e.index}`, 1); this.ripples.push({ x: e.x, y: e.y, t: this.clock, amp: 0.4 }); break;
        case "inlane": this.popup(e.x, e.y, `+${fmt(e.points)}`, COLORS.pink, 12); this.boost.set(e.x < CENTER_X ? "inlane-l" : "inlane-r", 1); break;
        case "outlane": this.popup(e.x, e.y - 10, `+${fmt(e.points)}`, COLORS.white, 12); break;
        case "orbit": this.say("ORBIT!", `+${fmt(e.points)}`, COLORS.cyan, 1.3); this.burst(e.x, e.y, 16, [COLORS.cyan, COLORS.white], 280); this.ripples.push({ x: e.x, y: e.y, t: this.clock, amp: 0.8 }); this.boost.set(e.x < CENTER_X ? "orbit-l" : "orbit-r", 1); break;
        case "letter": {
          const lamp = t.lamps.find((l) => l.id === `letter-${e.index}`)!;
          this.boost.set(lamp.id, 1);
          this.ring(lamp.x, lamp.y, lamp.r, lamp.r + 26, COLORS.gold, 0.5);
          this.popup(lamp.x, lamp.y - 16, lamp.label ?? "", COLORS.gold, 22);
          break;
        }
        case "jackpot":
          this.say("JACKPOT!", `+${fmt(e.points)}`, COLORS.gold, 3);
          this.flashScreen(1, COLORS.gold);
          this.shake = this.reducedMotion ? 0 : 1;
          this.confetti(CENTER_X, 470, this.reducedMotion ? 40 : 140);
          for (let i = 0; i < 3; i++) this.ring(CENTER_X, 470, 10 + i * 20, 320, i % 2 ? COLORS.gold : COLORS.white, 1.4 + i * 0.2);
          this.ripples.push({ x: CENTER_X, y: 470, t: this.clock, amp: 1 }, { x: CENTER_X, y: 470, t: this.clock + 0.5, amp: 1 });
          break;
        case "multiplier": this.say(`${e.value}X MULTIPLIER`, "lanes complete", COLORS.cyan, 1.6); this.flashScreen(0.3, COLORS.cyan); this.ripples.push({ x: CENTER_X, y: 92, t: this.clock, amp: 1 }); break;
        case "combo": this.popup(e.x, e.y - 22, `COMBO x${e.count}`, COLORS.cyan, 12); break;
        case "ballsave": this.say("BALL SAVED", "shoot again", COLORS.lime, 1.4); this.flashScreen(0.25, COLORS.lime); break;
        case "drain": this.say(e.bonus > 0 ? `BONUS +${fmt(e.bonus)}` : "BALL LOST", undefined, COLORS.white, 1.3); break;
        case "nudge": this.shake = this.reducedMotion ? 0 : 0.5; break;
        case "newball": if (e.number > 1) this.say(`BALL ${e.number}`, undefined, COLORS.white, 1.2); break;
        case "start": this.flashScreen(0.3, COLORS.pink); this.ripples.push({ x: CENTER_X, y: 380, t: this.clock, amp: 1 }); this.say("BALL 1", "pull back and launch", COLORS.white, 1.6); break;
        case "highscore": this.say("NEW HIGH SCORE!", undefined, COLORS.gold, 1.8); this.flashScreen(0.4, COLORS.gold); break;
        case "launch": this.burst(PLUNGER_X, engine.plungerY - 14, 10, [COLORS.pink, COLORS.white], 200); this.ring(PLUNGER_X, engine.plungerY - 10, 6, 40, COLORS.pink, 0.4); break;
        case "gameover": this.message = null; break;
      }
    }
  }

  private say(text: string, sub: string | undefined, color: string, total: number) {
    if (this.message && this.message.text === "JACKPOT!" && this.message.life > 0.4 && text !== "JACKPOT!") return;
    this.message = { text, sub, life: total, total, color };
  }
  private flashScreen(a: number, color: string) { this.flash = Math.max(this.flash, a); this.flashColor = color; }
  private popup(x: number, y: number, text: string, color: string, size: number) { this.popups.push({ x, y, text, life: 0.9, total: 0.9, color, size }); if (this.popups.length > 24) this.popups.shift(); }
  private ring(x: number, y: number, r: number, maxR: number, color: string, total: number) { this.rings.push({ x, y, r, maxR, life: total, total, color, width: 3 }); }
  private burst(x: number, y: number, n: number, colors: string[], speed: number) {
    if (this.reducedMotion) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
      this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.3, total: 0.8, color: colors[i % colors.length], size: 1.5 + Math.random() * 2, confetti: false, rot: 0, spin: 0 });
    }
    if (this.sparks.length > 400) this.sparks.splice(0, this.sparks.length - 400);
  }
  private confetti(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, s = 300 + Math.random() * 500;
      this.sparks.push({ x: x + (Math.random() - 0.5) * 60, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.6 + Math.random() * 0.8, total: 2.4, color: PALETTE[i % PALETTE.length], size: 3 + Math.random() * 3, confetti: true, rot: Math.random() * 6.3, spin: (Math.random() - 0.5) * 12 });
    }
  }

  // ---------------------------------------------------------------- helpers
  private glow(color: string) {
    let c = this.glowCache.get(color);
    if (!c) {
      c = document.createElement("canvas"); c.width = c.height = 128;
      const g = c.getContext("2d")!;
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, color + "ff"); grad.addColorStop(0.25, color + "80"); grad.addColorStop(0.6, color + "22"); grad.addColorStop(1, color + "00");
      g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
      this.glowCache.set(color, c);
    }
    return c;
  }
  private drawGlow(x: number, y: number, size: number, color: string, alpha: number) {
    if (alpha <= 0.01) return;
    const ctx = this.ctx; ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(this.glow(color), x - size / 2, y - size / 2, size, size);
    ctx.globalAlpha = 1;
  }
  private text(str: string, x: number, y: number, size: number, color: string, opts: { align?: CanvasTextAlign; alpha?: number; spacing?: string; weight?: string; glow?: string } = {}) {
    const ctx = this.ctx as CanvasRenderingContext2D & { letterSpacing: string };
    ctx.save();
    ctx.font = `${opts.weight ?? "400"} ${size}px ${this.font}`;
    ctx.textAlign = opts.align ?? "center"; ctx.textBaseline = "middle";
    if ("letterSpacing" in ctx) ctx.letterSpacing = opts.spacing ?? "0.08em";
    ctx.globalAlpha = opts.alpha ?? 1;
    if (opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = size * 0.9; }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
    ctx.restore();
  }
  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx; ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  }
  private playfieldPath() {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(0, TABLE_H);
    ctx.lineTo(0, ARC_CENTER.y);
    ctx.arc(ARC_CENTER.x, ARC_CENTER.y, ARC_RADIUS, Math.PI, Math.PI * 2);
    ctx.lineTo(TABLE_W, TABLE_H);
    ctx.closePath();
  }

  // ---------------------------------------------------------------- static layer
  private ensureStatic(table: Table) {
    const key = `${this.canvas.width}x${this.canvas.height}:${this.font}`;
    if (this.staticKey === key && this.staticLayer) return;
    this.staticKey = key;
    const layer = document.createElement("canvas");
    layer.width = this.canvas.width; layer.height = this.canvas.height;
    const main = this.ctx;
    this.ctx = layer.getContext("2d")!;
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);

    // Cabinet surround.
    const cab = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    cab.addColorStop(0, "#1a0b24"); cab.addColorStop(1, "#0f0714");
    ctx.fillStyle = cab; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.translate(OX, OY);

    // Playfield base.
    this.playfieldPath();
    const base = ctx.createLinearGradient(0, 0, 0, TABLE_H);
    base.addColorStop(0, "#36154d"); base.addColorStop(0.45, "#261038"); base.addColorStop(1, "#190a26");
    ctx.fillStyle = base; ctx.fill();
    ctx.save();
    this.playfieldPath(); ctx.clip();
    const tint = (x: number, y: number, r: number, color: string, a: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color + Math.round(a * 255).toString(16).padStart(2, "0")); g.addColorStop(1, color + "00");
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    tint(181, 240, 190, COLORS.magenta, 0.22); tint(60, 560, 150, COLORS.violet, 0.18); tint(300, 560, 150, COLORS.violet, 0.18); tint(181, 470, 120, COLORS.gold, 0.1);

    // Decals: starburst behind the bumpers, sunburst behind JACKPOT, chevrons in lanes.
    ctx.save(); ctx.globalAlpha = 0.12; ctx.strokeStyle = COLORS.pink; ctx.lineWidth = 1.2;
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(181 + Math.cos(a) * 60, 236 + Math.sin(a) * 60); ctx.lineTo(181 + Math.cos(a) * 150, 236 + Math.sin(a) * 150); ctx.stroke(); }
    ctx.restore();
    for (const b of table.bumpers) { ctx.save(); ctx.strokeStyle = b.color; for (let k = 1; k <= 3; k++) { ctx.globalAlpha = 0.16 - k * 0.04; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(b.c.x, b.c.y, b.r + 8 * k, 0, Math.PI * 2); ctx.stroke(); } ctx.restore(); }
    ctx.save(); ctx.globalAlpha = 0.09; ctx.fillStyle = COLORS.gold;
    for (let i = 0; i < 12; i++) { const a = Math.PI + (i / 11) * Math.PI; ctx.beginPath(); ctx.moveTo(181, 478); ctx.lineTo(181 + Math.cos(a - 0.05) * 120, 478 + Math.sin(a - 0.05) * 120); ctx.lineTo(181 + Math.cos(a + 0.05) * 120, 478 + Math.sin(a + 0.05) * 120); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    const chevron = (x: number, y: number, up: boolean, color: string, a: number) => {
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = "round";
      const d = up ? -1 : 1; ctx.beginPath(); ctx.moveTo(x - 6, y - 5 * d); ctx.lineTo(x, y + 2 * d); ctx.lineTo(x + 6, y - 5 * d); ctx.stroke(); ctx.restore();
    };
    for (let i = 0; i < 4; i++) { chevron(22, 300 + i * 32 + 100, true, COLORS.cyan, 0.35 - i * 0.05); chevron(LANE_X - 22, 300 + i * 32 + 100, true, COLORS.cyan, 0.35 - i * 0.05); }
    for (let i = 0; i < 3; i++) { chevron(62, 540 + i * 14, false, COLORS.pink, 0.3); chevron(LANE_X - 62, 540 + i * 14, false, COLORS.pink, 0.3); }
    for (let i = 0; i < 7; i++) chevron(PLUNGER_X, 260 + i * 60, true, COLORS.pink, 0.25);
    this.text("HOT WELCOME", 181, 557, 9, COLORS.white, { alpha: 0.4, spacing: "0.35em" });
    this.text("ARCADE PINBALL", 181, 571, 7, COLORS.white, { alpha: 0.3, spacing: "0.35em" });
    this.text("ORBIT", 22, 452, 6, COLORS.cyan, { alpha: 0.6, spacing: "0.2em" });
    this.text("ORBIT", LANE_X - 22, 452, 6, COLORS.cyan, { alpha: 0.6, spacing: "0.2em" });
    this.text("SKILL LANES", 181, 160, 6.5, COLORS.amber, { alpha: 0.6, spacing: "0.3em" });

    // Solid wedges (outlane dividers, drop-bank island).
    for (const poly of table.wedges) {
      ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
      const g = ctx.createLinearGradient(0, 480, 0, 700); g.addColorStop(0, "#4a1d66"); g.addColorStop(1, "#2a1040");
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = COLORS.violet + "aa"; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // Slingshot bodies.
    for (const s of table.slings) {
      ctx.beginPath(); s.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
      const g = ctx.createLinearGradient(s.poly[0].x, s.poly[0].y, s.poly[2].x, s.poly[2].y); g.addColorStop(0, "#ff5fb0"); g.addColorStop(1, "#7a1f6b");
      ctx.fillStyle = g; ctx.fill();
      ctx.save(); ctx.shadowColor = COLORS.pink; ctx.shadowBlur = 14; ctx.strokeStyle = "#ffd6ec"; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    }
    // The drain hole between the flippers.
    const px = FLIPPER_PIVOT_X, qx = LANE_X - FLIPPER_PIVOT_X;
    const hole = ctx.createLinearGradient(0, 700, 0, TABLE_H); hole.addColorStop(0, "#12061a00"); hole.addColorStop(0.5, "#0a0310cc"); hole.addColorStop(1, "#000000");
    ctx.fillStyle = hole; ctx.fillRect(px, 700, qx - px, TABLE_H - 700);
    // Plunger lane floor.
    ctx.fillStyle = "#1a0a26"; ctx.fillRect(LANE_X, 745, TABLE_W - LANE_X, TABLE_H - 745);
    ctx.restore();

    // Neon walls.
    for (const w of table.walls) {
      if (w.hidden) continue;
      const color = w.color ?? COLORS.pink;
      ctx.save(); ctx.lineCap = "round";
      ctx.shadowColor = color; ctx.shadowBlur = 12;
      ctx.strokeStyle = color; ctx.lineWidth = w.r * 2 + 1; ctx.beginPath(); ctx.moveTo(w.a.x, w.a.y); ctx.lineTo(w.b.x, w.b.y); ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = "#ffffffcc"; ctx.lineWidth = Math.max(1, w.r * 0.7); ctx.stroke();
      ctx.restore();
    }
    for (const p of table.posts) { ctx.fillStyle = "#f3e9ff"; ctx.beginPath(); ctx.arc(p.c.x, p.c.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    // Outer rail (chrome look) around the playfield.
    ctx.save(); this.playfieldPath(); ctx.lineWidth = 7; ctx.strokeStyle = "#4a2160"; ctx.stroke();
    ctx.lineWidth = 3; const rail = ctx.createLinearGradient(0, 0, TABLE_W, 0); rail.addColorStop(0, "#e9d5ff"); rail.addColorStop(0.5, "#9d6bff"); rail.addColorStop(1, "#e9d5ff"); ctx.strokeStyle = rail; ctx.shadowColor = COLORS.violet; ctx.shadowBlur = 16; ctx.stroke(); ctx.restore();
    // Lamp bezels and bumper skirts.
    for (const l of table.lamps) { ctx.fillStyle = l.group === "rail" ? "#2b1238" : "#1b0c25"; ctx.beginPath(); ctx.arc(l.x, l.y, l.r + 2.5, 0, Math.PI * 2); ctx.fill(); }
    for (const b of table.bumpers) { ctx.fillStyle = "#170a20"; ctx.beginPath(); ctx.arc(b.c.x, b.c.y, b.r + 6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = b.color + "66"; ctx.lineWidth = 2; ctx.stroke(); }
    for (const s of table.standups) { ctx.fillStyle = "#1b0c25"; this.roundRect((s.a.x + s.b.x) / 2 - 5, s.a.y - 3, 10, s.b.y - s.a.y + 6, 3); ctx.fill(); }

    this.ctx = main;
    this.staticLayer = layer;
  }

  // ---------------------------------------------------------------- per frame
  draw(engine: PinballEngine, dt: number) {
    this.clock += dt;
    const ctx = this.ctx, t = engine.table;
    if (this.canvas.width === 0) return;
    this.ensureStatic(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.staticLayer!, 0, 0);
    const sx = this.shake > 0.01 ? (Math.random() - 0.5) * this.shake * 10 : 0, sy = this.shake > 0.01 ? (Math.random() - 0.5) * this.shake * 10 : 0;
    this.shake *= Math.exp(-dt * 4);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.translate(OX + sx, OY + sy);

    this.drawLamps(engine, dt);
    this.drawBumpers(engine);
    this.drawSlings(engine);
    this.drawTargets(engine);
    this.drawFlippers(engine);
    this.drawPlunger(engine);
    this.drawBall(engine);
    this.drawParticles(dt);
    this.drawMessage(dt);
    this.drawAttract(engine);

    // Flash and vignette.
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    if (this.flash > 0.01) { ctx.globalAlpha = this.flash * 0.55; ctx.fillStyle = this.flashColor; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalAlpha = 1; this.flash *= Math.exp(-dt * 5); }
    const v = ctx.createRadialGradient(VIEW_W / 2, VIEW_H * 0.45, VIEW_W * 0.35, VIEW_W / 2, VIEW_H * 0.5, VIEW_H * 0.7);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  private lampTarget(lamp: Lamp, e: PinballEngine): number {
    const c = this.clock;
    if (e.jackpotCelebrating) {
      if (lamp.group === "letter") return (Math.floor(c * 10) + lamp.index) % 2 === 0 ? 1 : 0.15;
      return Math.floor(c * 14) % 2 === 0 ? 1 : 0.1;
    }
    if (e.phase === "attract" || e.phase === "over") {
      if (lamp.group === "rail") return (lamp.index + Math.floor(c * 8)) % 5 === 0 ? 1 : 0.12;
      const p = Math.floor(c / 6) % 3;
      if (p === 0) return 0.5 + 0.5 * Math.sin(c * 2.5 - lamp.y * 0.015);
      if (p === 1) { const d = Math.hypot(lamp.x - CENTER_X, lamp.y - 380); return 0.5 + 0.5 * Math.sin(c * 3 - d * 0.03); }
      if (lamp.group === "letter") return Math.floor(c * 5) % 9 === lamp.index ? 1 : 0.12;
      return Math.sin(c * 4 + lamp.index * 1.7 + lamp.x * 0.1) > 0.55 ? 1 : 0.1;
    }
    switch (lamp.group) {
      case "lane": return e.lanes[lamp.index] ? 1 : 0.06;
      case "letter": {
        if (e.letters[lamp.index]) return 1;
        return e.letters.indexOf(false) === lamp.index ? 0.2 + 0.12 * Math.sin(c * 5) : 0.08;
      }
      case "mult": return e.multiplier >= lamp.index ? 1 : 0.06;
      case "bank": { const n = e.table.drops.filter((d) => d.down).length; return n === 3 ? 1 : n === 2 ? 0.45 + 0.25 * Math.sin(c * 8) : n === 1 ? 0.3 : 0.08; }
      case "save": { if (!e.ballSaveActive) return 0.05; const left = e.saveUntil - e.time; return left < 1.5 ? (Math.floor(c * 8) % 2 ? 1 : 0.15) : 1; }
      case "orbit": return 0.35 + 0.25 * Math.sin(c * 3 + lamp.index * Math.PI);
      case "inlane": return 0.12;
      case "standup": return e.letters.includes(false) ? 0.35 + 0.3 * Math.sin(c * 5 + lamp.index * 0.9) : 0.12;
      case "rail": return 0.22 + 0.14 * Math.sin(c * 2 + lamp.index * 0.5);
      default: return 0.1;
    }
  }

  private drawLamps(e: PinballEngine, dt: number) {
    const ctx = this.ctx;
    const ease = Math.min(1, dt * 14);
    this.ripples = this.ripples.filter((r) => this.clock - r.t < 1.1);
    for (const lamp of e.table.lamps) {
      let target = this.lampTarget(lamp, e);
      const b = this.boost.get(lamp.id) ?? 0;
      if (b > 0.01) { target = Math.min(1, target + b); this.boost.set(lamp.id, b * Math.exp(-dt * 5)); }
      for (const r of this.ripples) {
        const age = this.clock - r.t; if (age < 0) continue;
        const radius = age * 520, d = Math.hypot(lamp.x - r.x, lamp.y - r.y);
        const k = Math.exp(-(((d - radius) / 34) ** 2)) * r.amp * Math.max(0, 1 - age / 1.1);
        if (k > 0.02) target = Math.min(1, target + k);
      }
      const prev = this.intensity.get(lamp.id) ?? 0;
      const val = prev + (target - prev) * (target > prev ? Math.min(1, ease * 2) : ease);
      this.intensity.set(lamp.id, val);
      // Unlit base, then lit core and halo mixed by intensity.
      ctx.fillStyle = "#2a1535"; ctx.beginPath(); ctx.arc(lamp.x, lamp.y, lamp.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = lamp.color + "55"; ctx.lineWidth = 1; ctx.stroke();
      if (val > 0.03) {
        this.drawGlow(lamp.x, lamp.y, lamp.r * 7, lamp.color, val * 0.9);
        const g = ctx.createRadialGradient(lamp.x - lamp.r * 0.3, lamp.y - lamp.r * 0.3, 0, lamp.x, lamp.y, lamp.r);
        g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, lamp.color); g.addColorStop(1, lamp.color + "aa");
        ctx.globalAlpha = val; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lamp.x, lamp.y, lamp.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      }
      if (lamp.label) this.text(lamp.label, lamp.x, lamp.y + 0.5, lamp.group === "letter" ? 11 : 5.5, val > 0.5 ? "#2a0f33" : lamp.color, { alpha: val > 0.5 ? 0.9 : 0.55, spacing: "0.02em" });
    }
  }

  private drawBumpers(e: PinballEngine) {
    const ctx = this.ctx;
    for (const b of e.table.bumpers) {
      const since = e.time - b.hitAt, k = since < 0.25 ? 1 - since / 0.25 : 0;
      const idle = e.phase === "attract" ? 0.3 + 0.3 * Math.sin(this.clock * 2 + b.c.x) : 0.35;
      this.drawGlow(b.c.x, b.c.y, b.r * 5.5, b.color, idle + k * 0.9);
      const r = b.r * (1 + k * 0.08);
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.arc(b.c.x + 3, b.c.y + 5, r, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(b.c.x - r * 0.35, b.c.y - r * 0.35, 2, b.c.x, b.c.y, r);
      g.addColorStop(0, "#ffffff"); g.addColorStop(0.35, b.color); g.addColorStop(1, "#3a1050");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.c.x, b.c.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = b.color + "cc"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.c.x, b.c.y, r * 0.62, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(b.c.x, b.c.y, 4, 0, Math.PI * 2); ctx.fill();
      if (k > 0) { ctx.globalAlpha = k * 0.8; ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(b.c.x, b.c.y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    }
  }

  private drawSlings(e: PinballEngine) {
    const ctx = this.ctx;
    for (const s of e.table.slings) {
      const since = e.time - s.hitAt; if (since > 0.2) continue;
      const k = 1 - since / 0.2;
      ctx.save(); ctx.globalAlpha = k; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.shadowColor = COLORS.pink; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); ctx.stroke(); ctx.restore();
    }
  }

  private drawTargets(e: PinballEngine) {
    const ctx = this.ctx;
    for (const s of e.table.standups) {
      const since = e.time - s.hitAt, k = since < 0.3 ? 1 - since / 0.3 : 0;
      const x = (s.a.x + s.b.x) / 2, y = (s.a.y + s.b.y) / 2;
      this.drawGlow(x, y, 46, COLORS.gold, 0.25 + k);
      const g = ctx.createLinearGradient(x - 4, 0, x + 4, 0); g.addColorStop(0, "#fff1c2"); g.addColorStop(0.5, COLORS.gold); g.addColorStop(1, "#b07a1c");
      ctx.fillStyle = k > 0 ? `rgba(255,255,255,${0.5 + k * 0.5})` : g; this.roundRect(x - 3.5, s.a.y, 7, s.b.y - s.a.y, 2.5); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1; ctx.stroke();
    }
    for (const d of e.table.drops) {
      const x = (d.a.x + d.b.x) / 2, w = d.b.x - d.a.x;
      if (d.down) { ctx.fillStyle = "rgba(0,0,0,0.45)"; this.roundRect(x - w / 2, d.a.y - 2, w, 5, 2); ctx.fill(); continue; }
      const since = e.time - d.hitAt, k = since < 0.3 ? 1 - since / 0.3 : 0;
      this.drawGlow(x, d.a.y, 40, COLORS.lime, 0.22 + k);
      const g = ctx.createLinearGradient(0, d.a.y - 4, 0, d.a.y + 4); g.addColorStop(0, "#f0ffd0"); g.addColorStop(0.5, COLORS.lime); g.addColorStop(1, "#4f8a16");
      ctx.fillStyle = g; this.roundRect(x - w / 2, d.a.y - 3.5, w, 7, 2.5); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  private drawFlippers(e: PinballEngine) {
    const ctx = this.ctx;
    for (const f of e.table.flippers) {
      const tip = flipperTip(f), a = f.angle;
      const path = (ox: number, oy: number) => {
        ctx.beginPath();
        ctx.arc(f.pivot.x + ox, f.pivot.y + oy, f.baseR, a + Math.PI / 2, a + Math.PI * 1.5);
        ctx.arc(tip.x + ox, tip.y + oy, f.tipR, a - Math.PI / 2, a + Math.PI / 2);
        ctx.closePath();
      };
      path(3, 6); ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fill();
      path(0, 0);
      const nx = -Math.sin(a), ny = Math.cos(a);
      const g = ctx.createLinearGradient(f.pivot.x - nx * 11, f.pivot.y - ny * 11, f.pivot.x + nx * 11, f.pivot.y + ny * 11);
      g.addColorStop(0, "#ffffff"); g.addColorStop(0.45, "#ffd3ea"); g.addColorStop(1, "#ff4fa3");
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = f.pressed ? "#ffffff" : "#ff8fc8"; ctx.stroke();
      ctx.fillStyle = "#3a1050"; ctx.beginPath(); ctx.arc(f.pivot.x, f.pivot.y, 3.5, 0, Math.PI * 2); ctx.fill();
      if (f.pressed) this.drawGlow(tip.x, tip.y, 44, COLORS.pink, 0.5);
    }
  }

  private drawPlunger(e: PinballEngine) {
    const ctx = this.ctx, y = e.plungerY;
    // Spring.
    ctx.save(); ctx.strokeStyle = "#c9b6d8"; ctx.lineWidth = 1.5; ctx.beginPath();
    const top = y + 8, bottom = 742, coils = 9;
    for (let i = 0; i <= coils; i++) { const yy = top + ((bottom - top) * i) / coils; const xx = PLUNGER_X + (i % 2 ? 8 : -8); i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
    ctx.stroke(); ctx.restore();
    ctx.fillStyle = "#8d7aa0"; ctx.fillRect(PLUNGER_X - 2.5, y + 6, 5, 742 - y - 6);
    const g = ctx.createLinearGradient(LANE_X, 0, TABLE_W, 0); g.addColorStop(0, "#f5edff"); g.addColorStop(0.5, "#b89cd6"); g.addColorStop(1, "#f5edff");
    ctx.fillStyle = g; this.roundRect(LANE_X + 5, y, TABLE_W - LANE_X - 10, 7, 3); ctx.fill();
    if (e.charge > 0) {
      this.drawGlow(PLUNGER_X, y, 40 + e.charge * 50, COLORS.pink, e.charge);
      const h = 90 * e.charge;
      ctx.fillStyle = "rgba(255,255,255,0.12)"; this.roundRect(TABLE_W - 7, 600, 3.5, 90, 2); ctx.fill();
      ctx.fillStyle = COLORS.pink; this.roundRect(TABLE_W - 7, 690 - h, 3.5, h, 2); ctx.fill();
    }
  }

  private drawBall(e: PinballEngine) {
    const ctx = this.ctx, ball = e.ball;
    if (!ball) { this.trail.length = 0; return; }
    const { x, y } = ball.pos, r = ball.r;
    const speed = Math.hypot(ball.vel.x, ball.vel.y);
    if (e.phase === "play") { this.trail.push({ x, y }); if (this.trail.length > 9) this.trail.shift(); } else this.trail.length = 0;
    this.trail.forEach((p, i) => { const k = (i + 1) / this.trail.length; ctx.globalAlpha = 0.16 * k * Math.min(1, speed / 500); ctx.fillStyle = COLORS.pink; ctx.beginPath(); ctx.arc(p.x, p.y, r * k, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.beginPath(); ctx.ellipse(x + 3, y + 6, r * 1.05, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.22, "#eef1f7"); g.addColorStop(0.55, "#9aa2b3"); g.addColorStop(0.85, "#3c4250"); g.addColorStop(1, "#171a22");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    // Environment reflections: pink playfield below, cyan rail above.
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r - 0.6, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = "rgba(255,79,163,0.6)"; ctx.lineWidth = r * 0.45; ctx.beginPath(); ctx.arc(x, y, r * 0.78, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    ctx.strokeStyle = "rgba(79,240,255,0.45)"; ctx.lineWidth = r * 0.25; ctx.beginPath(); ctx.arc(x, y, r * 0.8, Math.PI * 1.55, Math.PI * 1.95); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.beginPath(); ctx.ellipse(x - r * 0.4, y - r * 0.45, r * 0.26, r * 0.18, -0.6, 0, Math.PI * 2); ctx.fill();
  }

  private drawParticles(dt: number) {
    const ctx = this.ctx;
    this.sparks = this.sparks.filter((p) => (p.life -= dt) > 0);
    for (const p of this.sparks) {
      p.vy += (p.confetti ? 500 : 700) * dt; p.vx *= 1 - (p.confetti ? 1.6 : 1.2) * dt; p.vy *= 1 - (p.confetti ? 1.2 : 0.4) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
      ctx.globalAlpha = Math.min(1, p.life / 0.35); ctx.fillStyle = p.color;
      if (p.confetti) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * Math.min(1, p.life / 0.4 + 0.3), 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    this.rings = this.rings.filter((r) => (r.life -= dt) > 0);
    for (const r of this.rings) {
      const k = 1 - r.life / r.total; const rad = r.r + (r.maxR - r.r) * (1 - (1 - k) ** 2);
      ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = r.color; ctx.lineWidth = r.width * (1 - k * 0.6);
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.popups = this.popups.filter((p) => (p.life -= dt) > 0);
    for (const p of this.popups) {
      const k = 1 - p.life / p.total;
      this.text(p.text, p.x, p.y - k * 36, p.size * (1 + k * 0.15), p.color, { alpha: Math.min(1, p.life / 0.3), glow: p.color, spacing: "0.06em" });
    }
  }

  private drawMessage(dt: number) {
    const m = this.message; if (!m) return;
    m.life -= dt; if (m.life <= 0) { this.message = null; return; }
    const age = m.total - m.life;
    const alpha = Math.min(1, age / 0.12, m.life / 0.4);
    const pop = 1 + Math.max(0, 0.25 - age) * 1.2;
    const big = m.text === "JACKPOT!";
    const y = 350;
    const ctx = this.ctx; ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(10,3,16,0.55)"; this.roundRect(CENTER_X - 130, y - (big ? 40 : 28), 260, big ? 86 : 60, 18); ctx.fill();
    ctx.strokeStyle = m.color + "88"; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    this.text(m.text, CENTER_X, y - (m.sub ? 6 : 0), (big ? 40 : 24) * pop, big && Math.floor(age * 12) % 2 === 0 ? "#ffffff" : m.color, { alpha, glow: m.color, spacing: "0.14em" });
    if (m.sub) this.text(m.sub.toUpperCase(), CENTER_X, y + (big ? 28 : 16), 9, "#ffffff", { alpha: alpha * 0.85, spacing: "0.3em" });
  }

  private drawAttract(e: PinballEngine) {
    if (e.phase !== "attract" && e.phase !== "over") return;
    const ctx = this.ctx, k = (this.clock * 0.25) % 1;
    const x = -200 + k * 800;
    ctx.save(); this.playfieldPath(); ctx.clip();
    const g = ctx.createLinearGradient(x - 120, 0, x + 120, 0);
    g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,0.07)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(-20, -20, TABLE_W + 40, TABLE_H + 40); ctx.restore();
  }
}
