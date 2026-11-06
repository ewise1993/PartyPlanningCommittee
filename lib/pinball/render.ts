// Canvas renderer: a static playfield layer plus per-frame lamps, targets, flippers,
// chrome ball, particles and messages. Works in table units scaled to the canvas.
//
// Look: a milky acrylic Hot Welcome machine. Electric fuchsia neon with a sharp white
// core, deep plum for type and contrast, and chrome for every metal part.
import { flipperTip } from "./physics";
import type { GameEvent, PinballEngine } from "./engine";
import { ARC_CENTER, ARC_RADIUS, CENTER_X, COLORS, FLIPPER_PIVOT_X, LANE_X, PLUNGER_X, TABLE_H, TABLE_W, type Lamp, type Table } from "./table";

export const VIEW_W = 440;
export const VIEW_H = 800;
const OX = 20, OY = 20;

const HOT = COLORS.pink;     // electric fuchsia
const HOT_DEEP = COLORS.violet;
const BLUSH = COLORS.blush;
const MILK = "#fffdfe";
const PLUM = "#32152b";

type Spark = { x: number; y: number; vx: number; vy: number; life: number; total: number; color: string; size: number; confetti: boolean; rot: number; spin: number };
type Ring = { x: number; y: number; r: number; maxR: number; life: number; total: number; color: string; width: number };
type Popup = { x: number; y: number; text: string; life: number; total: number; color: string; size: number };
type Message = { text: string; sub?: string; life: number; total: number };
type Ripple = { x: number; y: number; t: number; amp: number };

const SPARKS = [HOT, HOT_DEEP, PLUM];
const CONFETTI = [HOT, PLUM, BLUSH, "#c9ced8", HOT_DEEP, "#ffffff"];
const fmt = (n: number) => n.toLocaleString("en-US");

export class PinballRenderer {
  private ctx: CanvasRenderingContext2D;
  private scale = 1;
  private staticLayer: HTMLCanvasElement | null = null;
  private staticKey = "";
  private font = "sans-serif";
  private clock = 0;
  private bootAt = -99;
  private intensity = new Map<string, number>();
  private boost = new Map<string, number>();
  private bumperSpin = new Map<string, number>();
  private sparks: Spark[] = [];
  private rings: Ring[] = [];
  private popups: Popup[] = [];
  private ripples: Ripple[] = [];
  private message: Message | null = null;
  private flash = 0;
  private flashColor = BLUSH;
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
          this.burst(e.x, e.y, 14, SPARKS, 260);
          this.ring(b.c.x, b.c.y, b.r, b.r + 34, HOT, 0.35);
          this.popup(e.x, e.y, `+${fmt(e.points)}`, 13);
          this.ripples.push({ x: b.c.x, y: b.c.y, t: this.clock, amp: 0.5 });
          break;
        }
        case "sling": this.burst(e.x, e.y, 9, SPARKS, 220); this.popup(e.x, e.y, `+${fmt(e.points)}`, 12); break;
        case "target": {
          this.burst(e.x, e.y, 12, SPARKS, 240);
          this.ring(e.x, e.y, 4, 30, HOT, 0.35);
          this.popup(e.x + (e.x < CENTER_X ? 20 : -20), e.y, `+${fmt(e.points)}`, 13);
          this.boost.set(e.id, 1);
          break;
        }
        case "drop": this.burst(e.x, e.y, 10, SPARKS, 220); this.popup(e.x, e.y - 8, `+${fmt(e.points)}`, 13); break;
        case "bank": this.say("BANK CLEARED", `+${fmt(e.points)}`, 1.6); this.flashScreen(0.3, BLUSH); this.ripples.push({ x: CENTER_X, y: 410, t: this.clock, amp: 1 }); this.boost.set("bank", 1); break;
        case "lane": this.popup(e.x, e.y + 30, `+${fmt(e.points)}`, 12); this.boost.set(`lane-${e.index}`, 1); this.ripples.push({ x: e.x, y: e.y, t: this.clock, amp: 0.4 }); break;
        case "inlane": this.popup(e.x, e.y, `+${fmt(e.points)}`, 12); this.boost.set(e.x < CENTER_X ? "inlane-l" : "inlane-r", 1); break;
        case "outlane": this.popup(e.x, e.y - 10, `+${fmt(e.points)}`, 12); break;
        case "orbit": this.say("ORBIT!", `+${fmt(e.points)}`, 1.3); this.burst(e.x, e.y, 16, SPARKS, 280); this.ripples.push({ x: e.x, y: e.y, t: this.clock, amp: 0.8 }); this.boost.set(e.x < CENTER_X ? "orbit-l" : "orbit-r", 1); break;
        case "letter": {
          const lamp = t.lamps.find((l) => l.id === `letter-${e.index}`)!;
          this.boost.set(lamp.id, 1);
          this.ring(lamp.x, lamp.y, lamp.r, lamp.r + 26, HOT, 0.5);
          this.popup(lamp.x, lamp.y - 18, lamp.label ?? "", 22);
          break;
        }
        case "jackpot":
          this.say("JACKPOT!", `+${fmt(e.points)}`, 3);
          this.flashScreen(0.9, HOT);
          this.shake = this.reducedMotion ? 0 : 1;
          this.confetti(CENTER_X, 470, this.reducedMotion ? 40 : 150);
          for (let i = 0; i < 3; i++) this.ring(CENTER_X, 470, 10 + i * 20, 320, i % 2 ? PLUM : HOT, 1.4 + i * 0.2);
          this.ripples.push({ x: CENTER_X, y: 470, t: this.clock, amp: 1 }, { x: CENTER_X, y: 470, t: this.clock + 0.5, amp: 1 });
          break;
        case "multiplier": this.say(`${e.value}X MULTIPLIER`, "lanes complete", 1.6); this.flashScreen(0.3, BLUSH); this.ripples.push({ x: CENTER_X, y: 92, t: this.clock, amp: 1 }); break;
        case "combo": this.popup(e.x, e.y - 22, `COMBO ×${e.count}`, 12); break;
        case "ballsave": this.say("BALL SAVED", "shoot again", 1.4); this.flashScreen(0.25, BLUSH); break;
        case "drain": this.say(e.bonus > 0 ? `BONUS +${fmt(e.bonus)}` : "BALL LOST", undefined, 1.3); break;
        case "nudge":
          this.shake = this.reducedMotion ? 0 : e.manual ? 0.9 : 0.5;
          if (e.manual && e.x !== undefined && e.y !== undefined) { this.ring(e.x, e.y, 8, 46, HOT, 0.35); this.burst(e.x, e.y + 8, 6, SPARKS, 160); }
          break;
        case "tiltwarn": this.say("EASY THERE!", "tilt warning", 1.2); this.flashScreen(0.25, PLUM); break;
        case "skillshot":
          this.say("SKILL SHOT!", `+${fmt(e.points)}`, 2);
          this.flashScreen(0.45, HOT);
          this.confetti(e.x, e.y + 20, this.reducedMotion ? 20 : 70);
          this.ring(e.x, e.y, 6, 160, HOT, 0.8);
          this.ripples.push({ x: e.x, y: e.y, t: this.clock, amp: 1 });
          for (let i = 0; i < 3; i++) this.boost.set(`lane-${i}`, 1);
          break;
        case "newball": if (e.number > 1) this.say(`BALL ${e.number}`, undefined, 1.2); break;
        case "start":
          this.bootAt = this.clock;
          this.flashScreen(0.35, BLUSH);
          this.ripples.push({ x: CENTER_X, y: TABLE_H, t: this.clock, amp: 1 });
          this.say("BALL 1", "pull back & launch", 1.8);
          break;
        case "highscore": this.say("NEW HIGH SCORE!", undefined, 1.8); this.flashScreen(0.35, BLUSH); break;
        case "launch": this.burst(PLUNGER_X, engine.plungerY - 14, 10, SPARKS, 200); this.ring(PLUNGER_X, engine.plungerY - 10, 6, 40, HOT, 0.4); break;
        case "gameover": this.message = null; break;
      }
    }
  }

  private say(text: string, sub: string | undefined, total: number) {
    if (this.message && this.message.text === "JACKPOT!" && this.message.life > 0.4 && text !== "JACKPOT!") return;
    this.message = { text, sub, life: total, total };
  }
  private flashScreen(a: number, color: string) { this.flash = Math.max(this.flash, a); this.flashColor = color; }
  private popup(x: number, y: number, text: string, size: number) { this.popups.push({ x, y, text, life: 0.9, total: 0.9, color: HOT, size }); if (this.popups.length > 24) this.popups.shift(); }
  private ring(x: number, y: number, r: number, maxR: number, color: string, total: number) { this.rings.push({ x, y, r, maxR, life: total, total, color, width: 2.5 }); }
  private burst(x: number, y: number, n: number, colors: string[], speed: number) {
    if (this.reducedMotion) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
      this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.3, total: 0.8, color: colors[i % colors.length], size: 1.4 + Math.random() * 1.8, confetti: false, rot: 0, spin: 0 });
    }
    if (this.sparks.length > 400) this.sparks.splice(0, this.sparks.length - 400);
  }
  private confetti(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, s = 300 + Math.random() * 500;
      this.sparks.push({ x: x + (Math.random() - 0.5) * 60, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.6 + Math.random() * 0.8, total: 2.4, color: CONFETTI[i % CONFETTI.length], size: 3 + Math.random() * 3, confetti: true, rot: Math.random() * 6.3, spin: (Math.random() - 0.5) * 12 });
    }
  }

  // ---------------------------------------------------------------- helpers
  private glow(color: string) {
    let c = this.glowCache.get(color);
    if (!c) {
      c = document.createElement("canvas"); c.width = c.height = 128;
      const g = c.getContext("2d")!;
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      // Tight falloff keeps the neon crisp instead of a wide haze.
      grad.addColorStop(0, color + "ff"); grad.addColorStop(0.18, color + "99"); grad.addColorStop(0.45, color + "26"); grad.addColorStop(1, color + "00");
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
  private chrome(x0: number, y0: number, x1: number, y1: number) {
    const g = this.ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.28, "#d8dae2"); g.addColorStop(0.5, "#9ca1b0"); g.addColorStop(0.72, "#f5f6f9"); g.addColorStop(1, "#8b90a0");
    return g;
  }
  private text(str: string, x: number, y: number, size: number, color: string, opts: { align?: CanvasTextAlign; alpha?: number; spacing?: string; weight?: string; glow?: string } = {}) {
    const ctx = this.ctx as CanvasRenderingContext2D & { letterSpacing: string };
    ctx.save();
    ctx.font = `${opts.weight ?? "400"} ${size}px ${this.font}`;
    ctx.textAlign = opts.align ?? "center"; ctx.textBaseline = "middle";
    const spacing = opts.spacing ?? "0.08em";
    let dx = 0;
    if ("letterSpacing" in ctx) {
      ctx.letterSpacing = spacing;
      // Spacing is also added after the last glyph, so centred text drifts left by half of it.
      if (ctx.textAlign === "center") dx = (spacing.endsWith("em") ? parseFloat(spacing) * size : parseFloat(spacing) || 0) / 2;
    }
    ctx.globalAlpha = opts.alpha ?? 1;
    if (opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = size * 0.45; }
    ctx.fillStyle = color; ctx.fillText(str, x + dx, y);
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
  /** Crisp neon tube: faint halo, solid fuchsia body, hot white core. */
  private neonStroke(width: number, blur = 4) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = HOT + "33"; ctx.lineWidth = width + 4; ctx.stroke();
    ctx.shadowColor = HOT; ctx.shadowBlur = blur; ctx.strokeStyle = HOT; ctx.lineWidth = width; ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineWidth = Math.max(0.8, width * 0.35); ctx.stroke();
    ctx.restore();
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

    // Deep plum cabinet frame: the contrast that makes the milky table and the neon read.
    const cab = ctx.createLinearGradient(0, 0, VIEW_W, 0);
    cab.addColorStop(0, "#3d1a35"); cab.addColorStop(0.5, "#2a1024"); cab.addColorStop(1, "#3d1a35");
    ctx.fillStyle = cab; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const sheen = ctx.createLinearGradient(0, 0, VIEW_W * 0.6, VIEW_H * 0.4);
    sheen.addColorStop(0, "rgba(255,255,255,0.12)"); sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.translate(OX, OY);

    // Playfield base.
    this.playfieldPath();
    const base = ctx.createLinearGradient(0, 0, 0, TABLE_H);
    base.addColorStop(0, MILK); base.addColorStop(0.6, "#fffafc"); base.addColorStop(1, "#fff0f7");
    ctx.fillStyle = base; ctx.fill();
    ctx.save();
    this.playfieldPath(); ctx.clip();
    const tint = (x: number, y: number, r: number, color: string, a: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color + Math.round(a * 255).toString(16).padStart(2, "0")); g.addColorStop(1, color + "00");
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    tint(181, 240, 190, HOT, 0.07); tint(181, 470, 120, HOT, 0.06); tint(181, 760, 170, PLUM, 0.08);

    // Fine plum dot grid: the printed-acrylic texture under the neon.
    ctx.fillStyle = PLUM; ctx.globalAlpha = 0.07;
    for (let y = 8; y < TABLE_H; y += 14) for (let x = (y / 14) % 2 ? 8 : 15; x < TABLE_W; x += 14) { ctx.beginPath(); ctx.arc(x, y, 0.7, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;

    // Decals: starburst behind the bumpers, sunburst behind JACKPOT, chevrons in lanes.
    ctx.save(); ctx.globalAlpha = 0.14; ctx.strokeStyle = HOT; ctx.lineWidth = 1;
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(181 + Math.cos(a) * 62, 236 + Math.sin(a) * 62); ctx.lineTo(181 + Math.cos(a) * 150, 236 + Math.sin(a) * 150); ctx.stroke(); }
    ctx.restore();
    for (const b of table.bumpers) { ctx.save(); ctx.strokeStyle = PLUM; ctx.lineWidth = 1; for (let k = 1; k <= 3; k++) { ctx.globalAlpha = 0.14 - k * 0.035; ctx.beginPath(); ctx.arc(b.c.x, b.c.y, b.r + 9 * k, 0, Math.PI * 2); ctx.stroke(); } ctx.restore(); }
    ctx.save(); ctx.globalAlpha = 0.08; ctx.fillStyle = HOT;
    for (let i = 0; i < 12; i++) { const a = Math.PI + (i / 11) * Math.PI; ctx.beginPath(); ctx.moveTo(181, 478); ctx.lineTo(181 + Math.cos(a - 0.05) * 125, 478 + Math.sin(a - 0.05) * 125); ctx.lineTo(181 + Math.cos(a + 0.05) * 125, 478 + Math.sin(a + 0.05) * 125); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    const chevron = (x: number, y: number, up: boolean, color: string, a: number) => {
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
      const d = up ? -1 : 1; ctx.beginPath(); ctx.moveTo(x - 6, y - 5 * d); ctx.lineTo(x, y + 2 * d); ctx.lineTo(x + 6, y - 5 * d); ctx.stroke(); ctx.restore();
    };
    for (let i = 0; i < 4; i++) { chevron(22, 400 + i * 32, true, PLUM, 0.38 - i * 0.07); chevron(LANE_X - 22, 400 + i * 32, true, PLUM, 0.38 - i * 0.07); }
    for (let i = 0; i < 3; i++) { chevron(62, 540 + i * 14, false, HOT, 0.5); chevron(LANE_X - 62, 540 + i * 14, false, HOT, 0.5); }
    for (let i = 0; i < 7; i++) chevron(PLUNGER_X, 260 + i * 60, true, HOT, 0.32);
    this.text("HOT WELCOME", 181, 556, 12.5, HOT, { spacing: "0.14em", weight: "700" });
    this.text("ARCADE PINBALL", 181, 571, 6.5, PLUM, { alpha: 0.6, spacing: "0.32em" });
    this.text("ORBIT", 22, 452, 6, PLUM, { alpha: 0.6, spacing: "0.2em" });
    this.text("ORBIT", LANE_X - 22, 452, 6, PLUM, { alpha: 0.6, spacing: "0.2em" });
    this.text("SKILL LANES", 181, 160, 6.5, PLUM, { alpha: 0.55, spacing: "0.3em" });

    // Solid wedges (outlane aprons).
    for (const poly of table.wedges) {
      ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
      const g = ctx.createLinearGradient(0, 560, 0, 760); g.addColorStop(0, MILK); g.addColorStop(1, "#ffe6f3");
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = PLUM + "4d"; ctx.lineWidth = 1; ctx.stroke();
    }
    // Slingshot bodies: clear acrylic with a neon kicker edge.
    for (const s of table.slings) {
      ctx.beginPath(); s.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
      const g = ctx.createLinearGradient(s.poly[0].x, s.poly[0].y, s.poly[2].x, s.poly[2].y); g.addColorStop(0, "rgba(255,255,255,0.95)"); g.addColorStop(1, "rgba(255,0,153,0.22)");
      ctx.fillStyle = g; ctx.fill();
      this.neonStroke(1.6, 3);
    }
    // The drain: a deep plum well between the flippers.
    const px = FLIPPER_PIVOT_X, qx = LANE_X - FLIPPER_PIVOT_X;
    const hole = ctx.createLinearGradient(0, 700, 0, TABLE_H); hole.addColorStop(0, PLUM + "00"); hole.addColorStop(0.5, PLUM + "26"); hole.addColorStop(1, PLUM + "73");
    ctx.fillStyle = hole; ctx.fillRect(px, 700, qx - px, TABLE_H - 700);
    // Plunger lane floor.
    ctx.fillStyle = "rgba(255,214,237,0.7)"; ctx.fillRect(LANE_X, 745, TABLE_W - LANE_X, TABLE_H - 745);
    ctx.restore();

    // Neon guide rails.
    for (const w of table.walls) {
      if (w.hidden) continue;
      ctx.beginPath(); ctx.moveTo(w.a.x, w.a.y); ctx.lineTo(w.b.x, w.b.y);
      this.neonStroke(w.r * 2, 4);
    }
    // Chrome posts.
    for (const p of table.posts) { ctx.fillStyle = this.chrome(p.c.x - p.r, p.c.y - p.r, p.c.x + p.r, p.c.y + p.r); ctx.beginPath(); ctx.arc(p.c.x, p.c.y, p.r + 0.6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = PLUM + "55"; ctx.lineWidth = 0.6; ctx.stroke(); }
    // Chrome outer rail with a fine plum keyline.
    ctx.save(); this.playfieldPath();
    ctx.lineWidth = 8; ctx.strokeStyle = this.chrome(0, 0, TABLE_W, TABLE_H); ctx.shadowColor = "rgba(50,21,43,0.22)"; ctx.shadowBlur = 8; ctx.stroke();
    ctx.shadowBlur = 0; ctx.lineWidth = 0.8; ctx.strokeStyle = PLUM + "59"; ctx.stroke(); ctx.restore();
    // Chrome bezels for lamps and bumper skirts.
    for (const l of table.lamps) {
      ctx.fillStyle = this.chrome(l.x - l.r, l.y - l.r - 3, l.x + l.r, l.y + l.r + 3);
      ctx.beginPath(); ctx.arc(l.x, l.y, l.r + 2.2, 0, Math.PI * 2); ctx.fill();
    }
    for (const b of table.bumpers) {
      ctx.fillStyle = this.chrome(b.c.x - b.r, b.c.y - b.r - 6, b.c.x + b.r, b.c.y + b.r + 6);
      ctx.beginPath(); ctx.arc(b.c.x, b.c.y, b.r + 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = PLUM + "40"; ctx.lineWidth = 0.8; ctx.stroke();
    }
    for (const s of table.standups) {
      const x = (s.a.x + s.b.x) / 2;
      ctx.fillStyle = this.chrome(x - 6, 0, x + 6, 0); this.roundRect(x - 5.5, s.a.y - 3.5, 11, s.b.y - s.a.y + 7, 3.5); ctx.fill();
    }

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
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.staticLayer!, 0, 0);
    const sx = this.shake > 0.01 ? (Math.random() - 0.5) * this.shake * 10 : 0, sy = this.shake > 0.01 ? (Math.random() - 0.5) * this.shake * 10 : 0;
    this.shake *= Math.exp(-dt * 4);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.translate(OX + sx, OY + sy);

    this.drawRipples();
    this.drawLamps(engine, dt);
    this.drawJackpotShow(engine);
    this.drawLedEdge(engine);
    this.drawBumpers(engine, dt);
    this.drawSlings(engine);
    this.drawTargets(engine);
    this.drawFlippers(engine);
    this.drawPlunger(engine);
    this.drawBall(engine);
    this.drawParticles(dt);
    this.drawMessage(dt);
    this.drawAttract(engine);

    // Colour flash.
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    if (this.flash > 0.01) { ctx.globalAlpha = this.flash * 0.5; ctx.fillStyle = this.flashColor; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalAlpha = 1; this.flash *= Math.exp(-dt * 5); }
  }

  private get booting() { return this.clock - this.bootAt < 1.2; }

  // Light waves spreading across the acrylic.
  private drawRipples() {
    const ctx = this.ctx;
    ctx.save(); this.playfieldPath(); ctx.clip();
    ctx.strokeStyle = HOT;
    for (const r of this.ripples) {
      const age = this.clock - r.t; if (age < 0) continue;
      const fade = Math.max(0, 1 - age / 1.1);
      ctx.globalAlpha = 0.24 * r.amp * fade; ctx.lineWidth = 6 * fade + 1.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, age * 520, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // LED strip chasing around the rail; it speeds up for combos, the start sequence and jackpots.
  private drawLedEdge(e: PinballEngine) {
    const ctx = this.ctx;
    const level = e.jackpotCelebrating ? 2 : this.booting || e.combo >= 3 ? 1 : 0;
    ctx.save(); this.playfieldPath();
    ctx.setLineDash(level === 2 ? [10, 10] : level === 1 ? [12, 16] : [16, 30]);
    ctx.lineDashOffset = this.reducedMotion ? 0 : -this.clock * [70, 220, 340][level];
    ctx.lineCap = "round"; ctx.lineWidth = [2.4, 3, 3.4][level];
    ctx.strokeStyle = HOT; ctx.shadowColor = HOT; ctx.shadowBlur = 5; ctx.globalAlpha = level ? 1 : 0.8;
    ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.restore();
  }

  // Fuchsia light show: a pulsing wash with beams wheeling out of the JACKPOT letters.
  private drawJackpotShow(e: PinballEngine) {
    if (!e.jackpotCelebrating) return;
    const ctx = this.ctx, c = this.clock, fade = Math.min(1, (e.jackpotUntil - e.time) / 0.5);
    ctx.save(); this.playfieldPath(); ctx.clip();
    ctx.fillStyle = HOT;
    ctx.globalAlpha = fade * (this.reducedMotion ? 0.14 : 0.16 + 0.1 * Math.sin(c * 16));
    ctx.fillRect(-20, -20, TABLE_W + 40, TABLE_H + 40);
    if (!this.reducedMotion) {
      ctx.translate(CENTER_X, 470); ctx.rotate(c * 1.6);
      ctx.globalAlpha = 0.26 * fade;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - 0.08) * 800, Math.sin(a - 0.08) * 800); ctx.lineTo(Math.cos(a + 0.08) * 800, Math.sin(a + 0.08) * 800); ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
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
        return e.letters.indexOf(false) === lamp.index ? 0.2 + 0.14 * Math.sin(c * 5) : 0.06;
      }
      case "mult": return e.multiplier >= lamp.index ? 1 : 0.06;
      case "bank": { const n = e.table.drops.filter((d) => d.down).length; return n === 3 ? 1 : n === 2 ? 0.45 + 0.25 * Math.sin(c * 8) : n === 1 ? 0.3 : 0.08; }
      case "save": { if (!e.ballSaveActive) return 0.05; const left = e.saveUntil - e.time; return left < 1.5 ? (Math.floor(c * 8) % 2 ? 1 : 0.15) : 1; }
      case "orbit": return 0.35 + 0.25 * Math.sin(c * 3 + lamp.index * Math.PI);
      case "inlane": return 0.12;
      case "standup": return e.letters.includes(false) ? 0.35 + 0.3 * Math.sin(c * 5 + lamp.index * 0.9) : 0.12;
      case "rail":
        // Combos turn the cabinet lights into a fast chase.
        if (e.combo >= 3) return (lamp.index + Math.floor(c * 16)) % 3 === 0 ? 1 : 0.22;
        return 0.2 + 0.8 * Math.max(0, Math.sin(c * 2.4 - lamp.index * 0.45)) ** 6;
      default: return 0.1;
    }
  }

  /** Start sequence: a band of light sweeps up the table and through every lamp. */
  private bootPulse(lamp: Lamp) {
    const age = this.clock - this.bootAt;
    if (age < 0 || age > 1.2) return 0;
    const front = TABLE_H + 40 - (age / 0.9) * (TABLE_H + 120);
    return Math.exp(-(((lamp.y - front) / 60) ** 2)) * Math.min(1, (1.2 - age) / 0.3);
  }

  private drawLamps(e: PinballEngine, dt: number) {
    const ctx = this.ctx;
    const ease = Math.min(1, dt * 14);
    this.ripples = this.ripples.filter((r) => this.clock - r.t < 1.1);
    for (const lamp of e.table.lamps) {
      let target = Math.max(this.lampTarget(lamp, e), this.bootPulse(lamp));
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
      const letter = lamp.group === "letter";
      // Unlit insert, then a lit fuchsia core with a tight halo.
      ctx.fillStyle = letter ? BLUSH : MILK; ctx.beginPath(); ctx.arc(lamp.x, lamp.y, lamp.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = PLUM + "4d"; ctx.lineWidth = 0.8; ctx.stroke();
      if (val > 0.03) {
        this.drawGlow(lamp.x, lamp.y, lamp.r * 5, lamp.color, val * 0.7);
        const g = ctx.createRadialGradient(lamp.x - lamp.r * 0.3, lamp.y - lamp.r * 0.35, 0, lamp.x, lamp.y, lamp.r);
        g.addColorStop(0, "#ffffff"); g.addColorStop(0.35, lamp.color); g.addColorStop(1, HOT_DEEP);
        ctx.globalAlpha = val; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lamp.x, lamp.y, lamp.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 0.8; ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (lamp.label) {
        const lit = val > 0.5;
        this.text(lamp.label, lamp.x, lamp.y + 0.5, letter ? 11 : 5.5, lit ? "#ffffff" : PLUM, { alpha: lit ? 1 : letter ? 0.7 : 0.6, weight: letter ? "700" : "400", spacing: "0.02em" });
      }
    }
  }

  private drawBumpers(e: PinballEngine, dt: number) {
    const ctx = this.ctx;
    for (const b of e.table.bumpers) {
      const since = e.time - b.hitAt, k = since < 0.25 ? 1 - since / 0.25 : 0;
      const spin = (this.bumperSpin.get(b.id) ?? 0) + dt * (this.reducedMotion ? 0 : 0.7 + k * 12);
      this.bumperSpin.set(b.id, spin);
      const idle = e.phase === "attract" ? 0.3 + 0.25 * Math.sin(this.clock * 2 + b.c.x) : 0.3;
      this.drawGlow(b.c.x, b.c.y, b.r * 4.2, HOT, idle + k * 0.9);
      const r = b.r * (1 + k * 0.1);
      ctx.fillStyle = "rgba(50,21,43,0.16)"; ctx.beginPath(); ctx.arc(b.c.x + 2.5, b.c.y + 5, r, 0, Math.PI * 2); ctx.fill();
      // Glossy fuchsia cap.
      const g = ctx.createRadialGradient(b.c.x - r * 0.4, b.c.y - r * 0.45, 1, b.c.x, b.c.y, r);
      g.addColorStop(0, "#ffffff"); g.addColorStop(0.3, "#ff6cc5"); g.addColorStop(0.72, HOT); g.addColorStop(1, HOT_DEEP);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.c.x, b.c.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.2; ctx.stroke();
      // Spinning ring of light segments; it whips round when struck.
      ctx.save(); ctx.translate(b.c.x, b.c.y); ctx.rotate(spin);
      ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.setLineDash([3.5, 4.5]);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.66, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      // Chrome hub.
      ctx.fillStyle = this.chrome(b.c.x - 6, b.c.y - 6, b.c.x + 6, b.c.y + 6); ctx.beginPath(); ctx.arc(b.c.x, b.c.y, r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = k > 0 ? HOT : PLUM; ctx.beginPath(); ctx.arc(b.c.x, b.c.y, 1.8, 0, Math.PI * 2); ctx.fill();
      if (k > 0) { ctx.globalAlpha = k * 0.75; ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(b.c.x, b.c.y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineWidth = 1.8; ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(b.c.x, b.c.y, r * 0.84, Math.PI * 1.1, Math.PI * 1.42); ctx.stroke();
    }
  }

  private drawSlings(e: PinballEngine) {
    const ctx = this.ctx;
    for (const s of e.table.slings) {
      const since = e.time - s.hitAt; if (since > 0.2) continue;
      const k = 1 - since / 0.2;
      ctx.save(); ctx.globalAlpha = k;
      ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y);
      this.neonStroke(4.5, 10);
      ctx.restore();
    }
  }

  private drawTargets(e: PinballEngine) {
    const ctx = this.ctx;
    for (const s of e.table.standups) {
      const since = e.time - s.hitAt, k = since < 0.3 ? 1 - since / 0.3 : 0;
      const x = (s.a.x + s.b.x) / 2, y = (s.a.y + s.b.y) / 2;
      this.drawGlow(x, y, 40, HOT, 0.2 + k);
      const g = ctx.createLinearGradient(x - 4, 0, x + 4, 0); g.addColorStop(0, "#ff7ccb"); g.addColorStop(0.5, HOT); g.addColorStop(1, HOT_DEEP);
      ctx.fillStyle = k > 0 ? `rgba(255,255,255,${0.55 + k * 0.45})` : g; this.roundRect(x - 3.5, s.a.y, 7, s.b.y - s.a.y, 2.5); ctx.fill();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 0.9; ctx.stroke();
    }
    for (const d of e.table.drops) {
      const x = (d.a.x + d.b.x) / 2, w = d.b.x - d.a.x;
      if (d.down) { ctx.fillStyle = PLUM + "33"; this.roundRect(x - w / 2, d.a.y - 2, w, 5, 2); ctx.fill(); continue; }
      const since = e.time - d.hitAt, k = since < 0.3 ? 1 - since / 0.3 : 0;
      this.drawGlow(x, d.a.y, 36, HOT, 0.2 + k);
      const g = ctx.createLinearGradient(0, d.a.y - 4, 0, d.a.y + 4); g.addColorStop(0, "#ff8ad0"); g.addColorStop(0.55, HOT); g.addColorStop(1, PLUM);
      ctx.fillStyle = g; this.roundRect(x - w / 2, d.a.y - 3.5, w, 7, 2.5); ctx.fill();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 0.9; ctx.stroke();
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
      path(2.5, 5); ctx.fillStyle = "rgba(50,21,43,0.2)"; ctx.fill();
      if (f.pressed) this.drawGlow(tip.x, tip.y, 38, HOT, 0.55);
      // Chrome blade with a fuchsia rubber edge.
      path(0, 0);
      const nx = -Math.sin(a), ny = Math.cos(a);
      ctx.fillStyle = this.chrome(f.pivot.x - nx * 11, f.pivot.y - ny * 11, f.pivot.x + nx * 11, f.pivot.y + ny * 11); ctx.fill();
      ctx.save(); ctx.shadowColor = HOT; ctx.shadowBlur = f.pressed ? 6 : 2;
      ctx.lineWidth = f.pressed ? 3 : 2.4; ctx.strokeStyle = HOT; ctx.stroke(); ctx.restore();
      ctx.fillStyle = this.chrome(f.pivot.x - 5, f.pivot.y - 5, f.pivot.x + 5, f.pivot.y + 5); ctx.beginPath(); ctx.arc(f.pivot.x, f.pivot.y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PLUM; ctx.beginPath(); ctx.arc(f.pivot.x, f.pivot.y, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  private drawPlunger(e: PinballEngine) {
    const ctx = this.ctx, y = e.plungerY;
    // Chrome spring.
    ctx.save(); ctx.strokeStyle = "#a3a8b6"; ctx.lineWidth = 1.6; ctx.beginPath();
    const top = y + 8, bottom = 742, coils = 9;
    for (let i = 0; i <= coils; i++) { const yy = top + ((bottom - top) * i) / coils; const xx = PLUNGER_X + (i % 2 ? 8 : -8); i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
    ctx.stroke(); ctx.restore();
    ctx.fillStyle = this.chrome(PLUNGER_X - 3, 0, PLUNGER_X + 3, 0); ctx.fillRect(PLUNGER_X - 2.5, y + 6, 5, 742 - y - 6);
    ctx.fillStyle = this.chrome(LANE_X, 0, TABLE_W, 0); this.roundRect(LANE_X + 5, y, TABLE_W - LANE_X - 10, 7, 3); ctx.fill();
    ctx.strokeStyle = HOT; ctx.lineWidth = 1; ctx.stroke();
    if (e.charge > 0) {
      this.drawGlow(PLUNGER_X, y, 36 + e.charge * 44, HOT, e.charge);
      const h = 90 * e.charge;
      ctx.fillStyle = PLUM + "26"; this.roundRect(TABLE_W - 7, 600, 3.5, 90, 2); ctx.fill();
      ctx.fillStyle = HOT; this.roundRect(TABLE_W - 7, 690 - h, 3.5, h, 2); ctx.fill();
    }
  }

  private drawBall(e: PinballEngine) {
    const ctx = this.ctx, ball = e.ball;
    if (!ball) { this.trail.length = 0; return; }
    const { x, y } = ball.pos, r = ball.r;
    const speed = Math.hypot(ball.vel.x, ball.vel.y);
    if (e.phase === "play") { this.trail.push({ x, y }); if (this.trail.length > 10) this.trail.shift(); } else this.trail.length = 0;
    this.trail.forEach((p, i) => { const k = (i + 1) / this.trail.length; ctx.globalAlpha = 0.22 * k * Math.min(1, speed / 450); ctx.fillStyle = HOT; ctx.beginPath(); ctx.arc(p.x, p.y, r * k, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
    // Spotlight: a wide pool of light travels with the ball and brightens with speed.
    this.drawGlow(x, y + 2, r * 13, HOT, 0.1 + Math.min(0.14, speed / 9000));
    this.drawGlow(x, y + 2, r * 4.4, HOT, 0.32);
    // Speed streaks behind a fast ball.
    if (speed > 750 && e.phase === "play" && !this.reducedMotion) {
      const len = Math.min(70, (speed - 650) * 0.06), ux = ball.vel.x / speed, uy = ball.vel.y / speed;
      ctx.save(); ctx.lineCap = "round";
      for (const off of [-r * 0.55, 0, r * 0.55]) {
        const ox = -uy * off, oy = ux * off;
        const g = ctx.createLinearGradient(x + ox, y + oy, x + ox - ux * len, y + oy - uy * len);
        g.addColorStop(0, "rgba(255,0,153,0.55)"); g.addColorStop(1, "rgba(255,0,153,0)");
        ctx.strokeStyle = g; ctx.lineWidth = off === 0 ? 2.4 : 1.2;
        ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(x + ox - ux * len, y + oy - uy * len); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.fillStyle = "rgba(50,21,43,0.3)"; ctx.beginPath(); ctx.ellipse(x + 2.5, y + 5, r * 1.02, r * 0.78, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.2, "#f3f4f8"); g.addColorStop(0.52, "#a2a7b5"); g.addColorStop(0.82, "#4a3a48"); g.addColorStop(1, "#1d1019");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    // Reflections: fuchsia neon below, milky room above.
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r - 0.6, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = "rgba(255,0,153,0.7)"; ctx.lineWidth = r * 0.36; ctx.beginPath(); ctx.arc(x, y, r * 0.8, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = r * 0.22; ctx.beginPath(); ctx.arc(x, y, r * 0.8, Math.PI * 1.55, Math.PI * 1.95); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = "rgba(50,21,43,0.55)"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.ellipse(x - r * 0.4, y - r * 0.45, r * 0.26, r * 0.17, -0.6, 0, Math.PI * 2); ctx.fill();
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
      this.text(p.text, p.x, p.y - k * 36, p.size * (1 + k * 0.15), p.color, { alpha: Math.min(1, p.life / 0.3), weight: "700", glow: "#ffffff", spacing: "0.06em" });
    }
  }

  private drawMessage(dt: number) {
    const m = this.message; if (!m) return;
    m.life -= dt; if (m.life <= 0) { this.message = null; return; }
    const age = m.total - m.life;
    const alpha = Math.min(1, age / 0.12, m.life / 0.4);
    const pop = 1 + Math.max(0, 0.25 - age) * 1.2;
    const big = m.text === "JACKPOT!";
    const y = 350, w = 268, h = big ? 88 : 62;
    const ctx = this.ctx; ctx.save(); ctx.globalAlpha = alpha;
    ctx.shadowColor = "rgba(50,21,43,0.22)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
    ctx.fillStyle = big ? HOT : "rgba(255,253,254,0.94)"; this.roundRect(CENTER_X - w / 2, y - h / 2, w, h, 24); ctx.fill();
    ctx.shadowColor = "transparent"; ctx.lineWidth = 1.5; ctx.strokeStyle = big ? "#ffffff" : HOT; ctx.stroke();
    ctx.restore();
    const face = big ? (Math.floor(age * 12) % 2 === 0 ? "#ffffff" : BLUSH) : HOT;
    this.text(m.text, CENTER_X, y - (m.sub ? 7 : 0), (big ? 40 : 22) * pop, face, { alpha, weight: "700", spacing: "0.1em" });
    if (m.sub) this.text(m.sub.toUpperCase(), CENTER_X, y + (big ? 28 : 17), 8.5, big ? "#ffffff" : PLUM, { alpha: alpha * 0.85, spacing: "0.26em" });
  }

  private drawAttract(e: PinballEngine) {
    if (e.phase !== "attract" && e.phase !== "over") return;
    const ctx = this.ctx, k = (this.clock * 0.25) % 1;
    const x = -200 + k * 800;
    ctx.save(); this.playfieldPath(); ctx.clip();
    const g = ctx.createLinearGradient(x - 120, 0, x + 120, 0);
    g.addColorStop(0, "rgba(255,0,153,0)"); g.addColorStop(0.5, "rgba(255,0,153,0.09)"); g.addColorStop(1, "rgba(255,0,153,0)");
    ctx.fillStyle = g; ctx.fillRect(-20, -20, TABLE_W + 40, TABLE_H + 40); ctx.restore();
  }
}
