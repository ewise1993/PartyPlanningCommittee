"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTickets } from "@/components/TicketProvider";
import { BALLS_PER_GAME, PinballEngine, type Phase } from "@/lib/pinball/engine";
import { PinballRenderer } from "@/lib/pinball/render";
import { SoundBank } from "@/lib/pinball/sound";
import s from "./PinballGame.module.css";

type Hud = { phase: Phase; score: number; high: number; ball: number; mult: number; letters: string; combo: number; newHigh: boolean; tickets: number; lastBonus: number };
const LETTERS = "JACKPOT".split("");
const fmt = (n: number) => n.toLocaleString("en-US");
const snapshot = (e: PinballEngine): Hud => ({
  phase: e.phase, score: e.score, high: e.highScore, ball: e.ballNumber, mult: e.multiplier, letters: e.letters.map((l) => (l ? "1" : "0")).join(""),
  combo: e.combo, newHigh: e.newHigh, tickets: e.ticketsAwarded, lastBonus: e.lastBonus,
});
const sameHud = (a: Hud, b: Hud) => (Object.keys(a) as (keyof Hud)[]).every((k) => a[k] === b[k]);

export function PinballGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PinballEngine | null>(null);
  const soundRef = useRef<SoundBank | null>(null);
  const pointers = useRef(new Map<number, "left" | "right">());
  const { addTickets } = useTickets();
  const addTicketsRef = useRef(addTickets);
  const [hud, setHud] = useState<Hud>({ phase: "attract", score: 0, high: 0, ball: 0, mult: 1, letters: "0000000", combo: 0, newHigh: false, tickets: 0, lastBonus: 0 });
  const [soundOn, setSoundOn] = useState(true);
  const [touch, setTouch] = useState(false);

  useEffect(() => { addTicketsRef.current = addTickets; }, [addTickets]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new PinballEngine();
    const renderer = new PinballRenderer(canvas);
    const sound = new SoundBank();
    engineRef.current = engine; soundRef.current = sound;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __pinball?: PinballEngine }).__pinball = engine;
    setSoundOn(sound.enabled);
    setHud(snapshot(engine));
    try { setTouch(window.matchMedia("(hover: none), (pointer: coarse)").matches); } catch { /* ignore */ }

    const family = getComputedStyle(document.body).fontFamily;
    renderer.setFont(family);
    document.fonts?.ready.then(() => renderer.setFont(family)).catch(() => undefined);
    const ro = new ResizeObserver(() => renderer.resize());
    ro.observe(canvas);
    renderer.resize();

    let raf = 0, last = performance.now(), hudAt = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      engine.update(dt);
      const events = engine.drainEvents();
      let important = false;
      if (events.length) {
        renderer.handleEvents(events, engine);
        sound.handleEvents(events);
        for (const e of events) {
          if (e.type === "gameover" && e.tickets > 0) addTicketsRef.current(e.tickets);
          if (e.type !== "flipper" && e.type !== "bumper" && e.type !== "sling") important = true;
        }
      }
      renderer.draw(engine, dt);
      if (important || now - hudAt > 120) { hudAt = now; const next = snapshot(engine); setHud((prev) => (sameHud(prev, next) ? prev : next)); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const isGameKey = (k: string) => ["ArrowLeft", "ArrowRight", " ", "Enter", "a", "A", "d", "D"].includes(k);
    const onKeyDown = (ev: KeyboardEvent) => {
      if (!isGameKey(ev.key) || (ev.target instanceof HTMLElement && /input|textarea|select/i.test(ev.target.tagName))) return;
      ev.preventDefault();
      if (ev.repeat) return;
      sound.unlock();
      switch (ev.key) {
        case "ArrowLeft": case "a": case "A": engine.setFlipper("left", true); break;
        case "ArrowRight": case "d": case "D": engine.setFlipper("right", true); break;
        case " ": if (engine.phase === "attract" || engine.phase === "over") engine.start(); else engine.pressLaunch(); break;
        case "Enter": engine.start(); break;
      }
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      if (!isGameKey(ev.key)) return;
      ev.preventDefault();
      switch (ev.key) {
        case "ArrowLeft": case "a": case "A": engine.setFlipper("left", false); break;
        case "ArrowRight": case "d": case "D": engine.setFlipper("right", false); break;
        case " ": engine.releaseLaunch(); break;
      }
    };
    const releaseAll = () => { engine.setFlipper("left", false); engine.setFlipper("right", false); engine.releaseLaunch(); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseAll);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("blur", releaseAll);
      sound.dispose(); engineRef.current = null; soundRef.current = null;
    };
  }, []);

  const start = useCallback(() => { soundRef.current?.unlock(); engineRef.current?.start(); }, []);
  const flipper = useCallback((side: "left" | "right", pressed: boolean) => { if (pressed) soundRef.current?.unlock(); engineRef.current?.setFlipper(side, pressed); }, []);
  const launch = useCallback((pressed: boolean) => {
    const e = engineRef.current; if (!e) return;
    if (pressed) { soundRef.current?.unlock(); if (e.phase === "attract" || e.phase === "over") e.start(); else e.pressLaunch(); } else e.releaseLaunch();
  }, []);
  const toggleSound = useCallback(() => { const sb = soundRef.current; if (!sb) return; sb.setEnabled(!sb.enabled); setSoundOn(sb.enabled); }, []);

  // Tapping the playfield: left half = left flipper, right half = right flipper.
  const onPointerDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    const e = engineRef.current; if (!e) return;
    if (e.phase === "attract" || e.phase === "over") { start(); return; }
    const rect = ev.currentTarget.getBoundingClientRect();
    const side = ev.clientX - rect.left < rect.width / 2 ? "left" : "right";
    pointers.current.set(ev.pointerId, side);
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* capture is a nicety; input still works without it */ }
    flipper(side, true);
  };
  const onPointerUp = (ev: React.PointerEvent<HTMLDivElement>) => {
    const side = pointers.current.get(ev.pointerId); if (!side) return;
    pointers.current.delete(ev.pointerId);
    if (![...pointers.current.values()].includes(side)) flipper(side, false);
  };
  const hold = (down: () => void, up: () => void) => ({
    onPointerDown: (ev: React.PointerEvent<HTMLButtonElement>) => { ev.preventDefault(); try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* see above */ } down(); },
    onPointerUp: up, onPointerCancel: up, onLostPointerCapture: up,
    onKeyDown: (ev: React.KeyboardEvent) => { if (ev.key === " " || ev.key === "Enter") ev.preventDefault(); },
  });

  const playing = hud.phase === "ready" || hud.phase === "play" || hud.phase === "drain";
  return (
    <section className={s.page} data-arcade-theme="glass">
      <div className={s.topRow}>
        <div>
          <p className="eyebrow">Game 02 · Hot Welcome Arcade</p>
          <h1 className={s.title}>Pinball</h1>
        </div>
        <div className={s.actions}>
          <button type="button" className={`${s.pill} glass`} onClick={toggleSound} aria-pressed={soundOn}>
            <span aria-hidden="true">{soundOn ? "♪" : "∅"}</span> Sound {soundOn ? "on" : "off"}
          </button>
          <Link className={`${s.pill} glass`} href="/"><span className="arrow" aria-hidden="true">←</span> Back to games</Link>
        </div>
      </div>

      <div className={s.stage}>
        <div className={s.machine}>
          <div className={s.playfieldWrap} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} role="application" aria-label="Pinball playfield">
            <canvas ref={canvasRef} className={s.canvas} />
            {hud.phase === "attract" && (
              <div className={s.overlay}>
                <p className={s.marquee}>Hot Welcome</p>
                <button type="button" className={s.pressStart} onClick={start}>Press start</button>
                <p className={s.hint}>{touch ? "Tap to start · hold Launch to shoot" : "Enter to start · hold Space to launch"}</p>
                {hud.high > 0 && <p className={s.hint}>High score {fmt(hud.high)}</p>}
              </div>
            )}
            {hud.phase === "over" && (
              <div className={`${s.overlay} ${s.overlayDark}`}>
                <p className="eyebrow">Game over</p>
                <p className={s.finalScore}>{fmt(hud.score)}</p>
                {hud.newHigh && <p className={s.badge}>New high score</p>}
                {hud.tickets > 0 && <p className={s.tickets}>+{fmt(hud.tickets)} tickets added to your wallet</p>}
                <button type="button" className={`${s.pill} ${s.playAgain} glass`} onClick={start}>Play again</button>
              </div>
            )}
            {hud.phase === "ready" && <p className={s.readyHint}>{touch ? "Hold Launch, release to shoot" : "Hold Space, release to shoot"}</p>}
          </div>

          <div className={s.apron}>
            {touch ? (
              <div className={s.touchControls}>
                <button type="button" className={s.touchBtn} {...hold(() => flipper("left", true), () => flipper("left", false))} aria-label="Left flipper">◀ Flip</button>
                <button type="button" className={`${s.touchBtn} ${s.launchBtn}`} {...hold(() => launch(true), () => launch(false))} aria-label="Launch">{playing ? "Launch" : "Start"}</button>
                <button type="button" className={s.touchBtn} {...hold(() => flipper("right", true), () => flipper("right", false))} aria-label="Right flipper">Flip ▶</button>
              </div>
            ) : (
              <ul className={s.keys} aria-label="Controls">
                <li><kbd>←</kbd><kbd>A</kbd> Left flipper</li>
                <li><kbd>→</kbd><kbd>D</kbd> Right flipper</li>
                <li><kbd>Space</kbd> Hold &amp; release to launch</li>
                <li><kbd>Enter</kbd> Start</li>
              </ul>
            )}
          </div>
        </div>

        <aside className={s.backbox} aria-live="polite">
          <p className={s.backboxTitle}>Hot Welcome <span>Pinball</span></p>
          <div className={s.scoreBlock}>
            <span className={s.label}>Score</span>
            <span className={s.score}>{fmt(hud.score)}</span>
          </div>
          <div className={s.stats}>
            <div><span className={s.label}>Ball</span><span className={s.stat}>{playing ? `${hud.ball}/${BALLS_PER_GAME}` : "—"}</span></div>
            <div><span className={s.label}>Multiplier</span><span className={`${s.stat} ${hud.mult > 1 ? s.statHot : ""}`}>{hud.mult}×</span></div>
            <div><span className={s.label}>Combo</span><span className={`${s.stat} ${hud.combo >= 3 ? s.statHot : ""}`}>{hud.combo >= 2 ? `×${hud.combo}` : "—"}</span></div>
          </div>
          <div className={s.letters} aria-label="Jackpot letters">
            {LETTERS.map((ch, i) => <span key={ch} className={hud.letters[i] === "1" ? s.letterLit : s.letter}>{ch}</span>)}
          </div>
          <div className={s.high}><span className={s.label}>High score</span><span className={s.stat}>{fmt(hud.high)}</span></div>
          <p className={s.rules}>Light all three skill lanes to raise the multiplier. Pink targets, orbits and a cleared bank each light a JACKPOT letter. Spell it for 50,000 × your multiplier.</p>
        </aside>
      </div>
    </section>
  );
}
