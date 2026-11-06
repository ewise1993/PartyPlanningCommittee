"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTickets } from "@/components/TicketProvider";
import { BALLS_PER_GAME, PinballEngine, type Phase } from "@/lib/pinball/engine";
import { PinballRenderer } from "@/lib/pinball/render";
import { SoundBank } from "@/lib/pinball/sound";
import s from "./PinballGame.module.css";

type Hud = { phase: Phase; score: number; high: number; ball: number; mult: number; letters: string; combo: number; newHigh: boolean; tickets: number; lastBonus: number; jackpot: boolean };
const LETTERS = "JACKPOT".split("");
const fmt = (n: number) => n.toLocaleString("en-US");
const snapshot = (e: PinballEngine): Hud => ({
  phase: e.phase, score: e.score, high: e.highScore, ball: e.ballNumber, mult: e.multiplier, letters: e.letters.map((l) => (l ? "1" : "0")).join(""),
  combo: e.combo, newHigh: e.newHigh, tickets: e.ticketsAwarded, lastBonus: e.lastBonus, jackpot: e.jackpotCelebrating,
});
const sameHud = (a: Hud, b: Hud) => (Object.keys(a) as (keyof Hud)[]).every((k) => a[k] === b[k]);

export function PinballGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const machineRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<PinballEngine | null>(null);
  const soundRef = useRef<SoundBank | null>(null);
  const pointers = useRef(new Map<number, "left" | "right">());
  const { addTickets } = useTickets();
  const addTicketsRef = useRef(addTickets);
  const [hud, setHud] = useState<Hud>({ phase: "attract", score: 0, high: 0, ball: 0, mult: 1, letters: "0000000", combo: 0, newHigh: false, tickets: 0, lastBonus: 0, jackpot: false });
  const [paidTickets, setPaidTickets] = useState(0);
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

    // Start sequence: bring the whole table into view and replay the cabinet's power-up animation.
    let bootTimer = 0;
    const powerUp = () => {
      const el = machineRef.current; if (!el) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      el.classList.remove(s.boot); void el.offsetWidth; el.classList.add(s.boot);
      window.clearTimeout(bootTimer); bootTimer = window.setTimeout(() => el.classList.remove(s.boot), 1100);
    };

    // 3D tilt: the cabinet leans toward the cursor before a game, rocks with the ball in play,
    // and jolts when nudged. Written straight to CSS variables so React never re-renders for it.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mouse = { x: 0, y: 0, active: false };
    let rx = 0, ry = 0, kick = 0;
    const onMove = (ev: PointerEvent) => {
      const el = machineRef.current; if (!el || ev.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      mouse.x = Math.max(-1, Math.min(1, ((ev.clientX - r.left) / r.width) * 2 - 1));
      mouse.y = Math.max(-1, Math.min(1, ((ev.clientY - r.top) / r.height) * 2 - 1));
      mouse.active = true;
    };
    const onLeave = () => { mouse.active = false; };
    window.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("mouseleave", onLeave);
    const tilt = (dt: number) => {
      const el = machineRef.current; if (!el || reduceMotion) return;
      let tx = 0, ty = 0;
      if ((engine.phase === "play" || engine.phase === "ready") && engine.ball) { tx = ((engine.ball.pos.x - 181) / 181) * 1.6; ty = 0.8; }
      else if (mouse.active) { tx = mouse.x * 5; ty = -mouse.y * 4; }
      const k = Math.min(1, dt * 6);
      rx += (ty - rx) * k; ry += (tx - ry) * k; kick *= Math.exp(-dt * 10);
      el.style.setProperty("--rx", `${(rx + kick).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
      el.style.setProperty("--gx", `${(ry * 2.5).toFixed(1)}%`);
    };

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
          if (e.type === "start") { setPaidTickets(0); powerUp(); }
          if (e.type === "nudge" && e.manual) kick = 2.6;
          // The wallet is async and fails closed, so only report tickets it actually saved.
          if (e.type === "gameover" && e.tickets > 0) void addTicketsRef.current(e.tickets).then((saved) => { if (saved) setPaidTickets(e.tickets); });
          if (e.type !== "flipper" && e.type !== "bumper" && e.type !== "sling") important = true;
        }
      }
      renderer.draw(engine, dt);
      tilt(dt);
      if (important || now - hudAt > 120) { hudAt = now; const next = snapshot(engine); setHud((prev) => (sameHud(prev, next) ? prev : next)); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const isGameKey = (k: string) => ["ArrowLeft", "ArrowRight", " ", "Enter", "a", "A", "d", "D", "n", "N", "Shift"].includes(k);
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
        case "n": case "N": case "Shift": engine.nudgeTable(); break;
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
      cancelAnimationFrame(raf); ro.disconnect(); window.clearTimeout(bootTimer);
      window.removeEventListener("pointermove", onMove); document.documentElement.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("blur", releaseAll);
      sound.dispose(); engineRef.current = null; soundRef.current = null;
    };
  }, []);

  const start = useCallback(() => { soundRef.current?.unlock(); engineRef.current?.start(); }, []);
  const flipper = useCallback((side: "left" | "right", pressed: boolean) => { if (pressed) soundRef.current?.unlock(); engineRef.current?.setFlipper(side, pressed); }, []);
  const launch = useCallback((pressed: boolean) => {
    const e = engineRef.current; if (!e) return;
    // During play the launch button doubles as the nudge button.
    if (pressed) { soundRef.current?.unlock(); if (e.phase === "attract" || e.phase === "over") e.start(); else if (e.phase === "play") e.nudgeTable(); else e.pressLaunch(); } else e.releaseLaunch();
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
  const litCount = [...hud.letters].filter((l) => l === "1").length;
  const stageState = hud.jackpot ? s.stageJackpot : hud.combo >= 3 ? s.stageCombo : "";
  return (
    <section className={s.page} data-arcade-theme="glass">
      <header className={s.top}>
        <Link className={`${s.pill} glass`} href="/"><span aria-hidden="true">←</span> Games</Link>
        <div className={s.titleBlock}>
          <p className={s.kicker}>Hot Welcome Arcade · Game 02</p>
          <h1 className={s.title}>Pinball</h1>
        </div>
        <button type="button" className={`${s.pill} ${s.soundPill} glass`} onClick={toggleSound} aria-pressed={soundOn}>
          <span className={soundOn ? s.soundDotOn : s.soundDot} aria-hidden="true" /> Sound {soundOn ? "on" : "off"}
        </button>
      </header>

      <div className={`${s.stage} ${stageState}`}>
        <aside className={`${s.wing} ${s.scoreboard}`} aria-label="Scoreboard" aria-live="polite">
          <div className={s.scoreLine}>
            <span className={s.label}>Score</span>
            <span key={hud.score} className={s.score}>{fmt(hud.score)}</span>
          </div>
          <dl className={s.stats}>
            <div>
              <dt className={s.label}>Ball</dt>
              <dd className={s.balls} aria-label={playing ? `Ball ${hud.ball} of ${BALLS_PER_GAME}` : "No game in progress"}>
                {Array.from({ length: BALLS_PER_GAME }, (_, i) => i + 1).map((n) => (
                  <i key={n} className={!playing ? s.ballDot : n < hud.ball ? s.ballSpent : n === hud.ball ? s.ballLive : s.ballDot} />
                ))}
              </dd>
            </div>
            <div><dt className={s.label}>Multiplier</dt><dd className={`${s.stat} ${hud.mult > 1 ? s.statHot : ""}`}>{hud.mult}×</dd></div>
            <div><dt className={s.label}>Combo</dt><dd className={`${s.stat} ${hud.combo >= 3 ? s.statHot : ""}`}>{hud.combo >= 2 ? `×${hud.combo}` : "—"}</dd></div>
          </dl>
          <div className={s.best}><span className={s.label}>Best</span><span className={s.bestValue}>{fmt(hud.high)}</span></div>
        </aside>

        <div ref={machineRef} className={s.machine}>
          <div className={s.cabinet}>
            <div className={s.playfieldWrap} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} role="application" aria-label="Pinball playfield">
              <canvas ref={canvasRef} className={s.canvas} />
              {hud.phase === "attract" && (
                <div className={s.overlay}>
                  <p className={s.marquee}>Hot Welcome</p>
                  <button type="button" className={s.pressStart} onClick={start}><span>Press</span><span>Start</span></button>
                  <p className={s.hint}>{touch ? "Tap to play" : "Press Enter to play"}</p>
                  {hud.high > 0 && <p className={s.hintSoft}>Best {fmt(hud.high)}</p>}
                </div>
              )}
              {hud.phase === "over" && (
                <div className={`${s.overlay} ${s.overlayOver}`}>
                  <p className={s.marquee}>Game over</p>
                  <p className={s.finalScore}>{fmt(hud.score)}</p>
                  {hud.newHigh && <p className={s.badge}>New high score</p>}
                  {paidTickets > 0 && <p className={s.tickets}>+{fmt(paidTickets)} tickets added to your wallet</p>}
                  <button type="button" className={s.playAgain} onClick={start}>Play again</button>
                </div>
              )}
              {hud.phase === "ready" && <p className={s.readyHint}>{touch ? "Hold Launch to shoot" : "Hold Space to shoot"}</p>}
            </div>
          </div>
        </div>

        <section className={`${s.wing} ${s.jackpot}`} aria-label={`Jackpot: ${litCount} of 7 letters lit`}>
          <div className={s.jackpotHead}><span className={s.label}>Jackpot</span><span className={s.jackpotCount}>{litCount}/7</span></div>
          <div className={s.letters} aria-hidden="true">
            {LETTERS.map((ch, i) => <span key={ch} className={hud.letters[i] === "1" ? s.letterLit : s.letter} style={{ "--i": i } as React.CSSProperties}>{ch}</span>)}
          </div>
          <p className={s.note}>Pink targets, orbits and the drop bank light letters. Spell it for 50,000 × multiplier.</p>
        </section>

        <div className={`${s.wing} ${s.controls}`}>
          {touch ? (
            <div className={s.touchControls}>
              <button type="button" className={s.touchBtn} {...hold(() => flipper("left", true), () => flipper("left", false))} aria-label="Left flipper">◀</button>
              <button type="button" className={`${s.touchBtn} ${s.launchBtn}`} {...hold(() => launch(true), () => launch(false))} aria-label={hud.phase === "play" ? "Nudge" : "Launch"}>{hud.phase === "play" ? "Nudge" : playing ? "Launch" : "Start"}</button>
              <button type="button" className={s.touchBtn} {...hold(() => flipper("right", true), () => flipper("right", false))} aria-label="Right flipper">▶</button>
            </div>
          ) : (
            <ul className={s.keys} aria-label="Controls">
              <li><span className={s.keyGroup}><kbd>←</kbd><kbd>→</kbd></span>Flip</li>
              <li><span className={s.keyGroup}><kbd className={s.wide}>Space</kbd></span>Launch</li>
              <li><span className={s.keyGroup}><kbd>N</kbd></span>Nudge</li>
              <li><span className={s.keyGroup}><kbd className={s.wide}>Enter</kbd></span>Start</li>
            </ul>
          )}
          <p className={s.tip}><b>Skill shot</b> Roll a top lane straight off the launch for 5,000 × multiplier.</p>
        </div>
      </div>
    </section>
  );
}
