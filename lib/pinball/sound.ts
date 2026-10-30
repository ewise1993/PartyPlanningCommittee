// Retro arcade sound effects synthesised with the Web Audio API (no audio files).
import type { GameEvent } from "./engine";

export const SOUND_KEY = "hot-welcome-arcade:pinball-sound";
type Wave = OscillatorType;
type ToneOpts = { freq: number; to?: number; type?: Wave; dur?: number; gain?: number; delay?: number; attack?: number };
type NoiseOpts = { dur?: number; gain?: number; filter?: BiquadFilterType; freq?: number; to?: number; delay?: number };

export class SoundBank {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last = new Map<string, number>();

  constructor() {
    try { if (localStorage.getItem(SOUND_KEY) === "off") this.enabled = false; } catch { /* storage unavailable */ }
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    try { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch { /* ignore */ }
    if (on) { this.unlock(); this.play({ type: "lane", index: 0, x: 0, y: 0, points: 0 }); }
  }

  /** Must be called from a user gesture before anything can play. */
  unlock() {
    if (!this.enabled) return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  dispose() { void this.ctx?.close(); this.ctx = null; this.master = null; }

  handleEvents(events: GameEvent[]) { for (const e of events) this.play(e); }

  private live(): { ctx: AudioContext; master: GainNode } | null {
    return this.enabled && this.ctx && this.ctx.state === "running" && this.master ? { ctx: this.ctx, master: this.master } : null;
  }

  private throttle(key: string, ms: number) {
    const now = performance.now();
    if (now - (this.last.get(key) ?? -1e9) < ms) return false;
    this.last.set(key, now);
    return true;
  }

  private tone({ freq, to, type = "sine", dur = 0.1, gain = 0.25, delay = 0, attack = 0.003 }: ToneOpts) {
    const audio = this.live(); if (!audio) return;
    const { ctx, master } = audio, t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }

  private noise({ dur = 0.05, gain = 0.2, filter = "highpass", freq = 1500, to, delay = 0 }: NoiseOpts) {
    const audio = this.live(); if (!audio) return;
    const { ctx, master } = audio, t0 = ctx.currentTime + delay;
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noiseBuf;
    f.type = filter; f.Q.value = 1.2;
    f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0); src.stop(t0 + dur + 0.03);
  }

  private arpeggio(notes: number[], step: number, dur: number, gain: number, type: Wave = "triangle") {
    notes.forEach((n, i) => this.tone({ freq: n, type, dur, gain, delay: i * step }));
  }

  play(e: GameEvent) {
    if (!this.live()) return;
    switch (e.type) {
      case "flipper":
        if (e.pressed) { this.noise({ dur: 0.03, gain: 0.22, freq: 2200 }); this.tone({ freq: 95, to: 50, type: "triangle", dur: 0.06, gain: 0.3 }); }
        else this.noise({ dur: 0.02, gain: 0.1, freq: 1200 });
        break;
      case "bumper": {
        if (!this.throttle("bumper", 35)) break;
        const base = e.id.endsWith("1") ? 520 : e.id.endsWith("2") ? 620 : 440;
        this.tone({ freq: base, to: base * 1.5, type: "square", dur: 0.07, gain: 0.14 });
        this.noise({ dur: 0.025, gain: 0.16, filter: "bandpass", freq: 1800 });
        break;
      }
      case "sling":
        if (!this.throttle("sling", 60)) break;
        this.tone({ freq: 330, to: 250, type: "triangle", dur: 0.06, gain: 0.2 });
        this.noise({ dur: 0.03, gain: 0.14, freq: 1600 });
        break;
      case "target":
        this.tone({ freq: 900, to: 1350, dur: 0.1, gain: 0.18 });
        this.tone({ freq: 1800, dur: 0.06, gain: 0.07, delay: 0.02 });
        break;
      case "drop":
        this.tone({ freq: 260, to: 170, type: "sawtooth", dur: 0.09, gain: 0.16 });
        this.noise({ dur: 0.03, gain: 0.2, filter: "lowpass", freq: 900 });
        break;
      case "bank": this.arpeggio([523, 659, 784, 1046], 0.08, 0.14, 0.2); break;
      case "lane": this.tone({ freq: 740, to: 990, dur: 0.08, gain: 0.15 }); break;
      case "inlane": this.tone({ freq: 620, dur: 0.06, gain: 0.12 }); break;
      case "outlane": this.tone({ freq: 240, to: 120, type: "sawtooth", dur: 0.25, gain: 0.14 }); break;
      case "orbit": this.tone({ freq: 400, to: 1400, dur: 0.22, gain: 0.18 }); this.tone({ freq: 800, to: 2800, dur: 0.22, gain: 0.06 }); break;
      case "letter": this.tone({ freq: 1046, dur: 0.09, gain: 0.18 }); this.tone({ freq: 1568, dur: 0.14, gain: 0.18, delay: 0.09 }); break;
      case "jackpot":
        this.arpeggio([523, 659, 784, 1046, 784, 1046, 1318, 1568, 2093], 0.09, 0.16, 0.22);
        this.arpeggio([1046, 1318, 1568, 2093], 0.09, 0.4, 0.14, "square");
        this.noise({ dur: 0.5, gain: 0.25, filter: "lowpass", freq: 4000, to: 200 });
        this.tone({ freq: 55, dur: 1.4, type: "sine", gain: 0.3, attack: 0.05 });
        this.tone({ freq: 1568, to: 1570, dur: 0.9, type: "triangle", gain: 0.12, delay: 0.85 });
        break;
      case "multiplier": this.arpeggio([659, 880, 1108], 0.07, 0.12, 0.18); break;
      case "combo":
        if (!this.throttle("combo", 120)) break;
        this.tone({ freq: 880 * Math.pow(1.06, Math.min(e.count, 16)), dur: 0.06, gain: 0.12, type: "triangle" });
        break;
      case "ballsave": this.arpeggio([1200, 1200, 1600], 0.07, 0.06, 0.16, "square"); break;
      case "drain": this.tone({ freq: 300, to: 70, type: "sawtooth", dur: 0.45, gain: 0.18 }); break;
      case "nudge": this.tone({ freq: 80, to: 40, type: "triangle", dur: 0.08, gain: 0.3 }); this.noise({ dur: 0.04, gain: 0.15, filter: "lowpass", freq: 500 }); break;
      case "newball": this.tone({ freq: 440, dur: 0.08, gain: 0.14 }); this.tone({ freq: 660, dur: 0.12, gain: 0.14, delay: 0.1 }); break;
      case "start": this.arpeggio([392, 523, 659, 784], 0.08, 0.14, 0.18); break;
      case "gameover": this.arpeggio([660, 523, 392], 0.17, 0.3, 0.16, "triangle"); break;
      case "highscore": this.arpeggio([1318, 1760, 2093], 0.08, 0.2, 0.16); break;
      case "launch":
        this.noise({ dur: 0.28, gain: 0.22, filter: "bandpass", freq: 300, to: 3200 });
        this.tone({ freq: 150, to: 600, type: "sawtooth", dur: 0.25, gain: 0.1 });
        break;
    }
  }
}
