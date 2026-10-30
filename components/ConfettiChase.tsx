"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTickets } from "@/components/TicketProvider";
import { createGame, isOpen, pause, progress, steer, step, togglePause, type DirName, type Game, type Mover, type Status } from "@/lib/confetti-chase";

// Swap or add team photos here: transparent PNG head cutouts in public/game-1/.
const TEAM = [
  { src: "/game-1/face-1.png", name: "Teammate 1" },
  { src: "/game-1/face-2.png", name: "Teammate 2" },
  { src: "/game-1/face-3.png", name: "Teammate 3" },
];
const POINTS_PER_TICKET = 100;
const CONFETTI = ["#ffd36e", "#ff8fd1", "#8fe3ff", "#b6ff9e", "#ffffff"];
const KEYS: Record<string, DirName> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right",
};
type Hud = { score: number; lives: number; level: number; status: Status };

export function ConfettiChase() {
  const { addTickets } = useTickets();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const facesRef = useRef<HTMLImageElement[]>([]);
  const awardedRef = useRef(false);
  const [hero, setHero] = useState<number | null>(null);
  const [hud, setHud] = useState<Hud>({ score: 0, lives: 3, level: 1, status: "ready" });
  const [earned, setEarned] = useState(0);

  useEffect(() => {
    facesRef.current = TEAM.map(({ src }) => Object.assign(new Image(), { src }));
  }, []);

  const start = useCallback((index: number) => {
    gameRef.current = createGame();
    awardedRef.current = false;
    setEarned(0);
    setHero(index);
    frameRef.current?.focus();
  }, []);

  // Game loop: fixed rules in lib/confetti-chase, drawing here.
  useEffect(() => {
    if (hero === null) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const chaserFaces = TEAM.map((_, i) => i).filter((i) => i !== hero);
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const game = gameRef.current!;
      step(game, Math.min(0.05, (now - last) / 1000));
      last = now;
      draw(ctx, canvas, game, facesRef.current, hero, chaserFaces, now);
      setHud((prev) => prev.score === game.score && prev.lives === game.lives && prev.level === game.level && prev.status === game.status
        ? prev : { score: game.score, lives: game.lives, level: game.level, status: game.status });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // Pause when the player looks away so they come back to a pause screen, not a lost life.
    const away = () => { if (gameRef.current) pause(gameRef.current); };
    const onVisibility = () => { if (document.hidden) away(); };
    window.addEventListener("blur", away);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("blur", away);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hero]);

  // Tickets are paid out once per finished run.
  useEffect(() => {
    if (hud.status !== "over" || awardedRef.current) return;
    awardedRef.current = true;
    const tickets = Math.floor(hud.score / POINTS_PER_TICKET);
    if (tickets > 0 && addTickets(tickets)) setEarned(tickets);
  }, [hud.status, hud.score, addTickets]);

  useEffect(() => {
    if (hero === null) return;
    const onKey = (event: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game) return;
      const dir = KEYS[event.key];
      // Leave the page's own keys alone once the run is over, and let focused buttons and links handle Space.
      if (dir) {
        if (game.status === "over") return;
        event.preventDefault();
        steer(game, dir);
      } else if (event.key === " " || event.key === "p" || event.key === "P" || event.key === "Escape") {
        if (event.target instanceof Element && event.target.closest("button, a, input, select, textarea")) return;
        event.preventDefault();
        if (game.status === "over") start(hero);
        else togglePause(game);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hero, start]);

  // Swipe anywhere on the board to steer on touch screens.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchMove = (e: React.TouchEvent) => {
    const from = touch.current, game = gameRef.current;
    if (!from || !game) return;
    const dx = e.touches[0].clientX - from.x, dy = e.touches[0].clientY - from.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    steer(game, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const press = (dir: DirName) => { if (gameRef.current) steer(gameRef.current, dir); };

  if (hero === null) {
    return <section className="chase-select glass" aria-labelledby="select-heading">
      <p className="eyebrow">Choose your player</p>
      <h2 id="select-heading">Who&rsquo;s collecting the confetti?</h2>
      <p>The other two will be right behind you.</p>
      <div className="chase-roster">{TEAM.map((member, i) => <button type="button" key={member.src} className="chase-pick glass" onClick={() => start(i)} aria-label={`Play as ${member.name}`}>
        <img src={member.src} alt="" width={120} height={120}/>
      </button>)}</div>
    </section>;
  }

  const overlay = hud.status === "over" ? "over" : hud.status === "paused" ? "paused" : hud.status === "cleared" ? "cleared" : hud.status === "ready" ? "ready" : null;
  return <section className="chase" aria-label="Confetti Chase game">
    <div className="chase-hud">
      <span className="chase-stat glass"><span className="eyebrow">Score</span>{hud.score.toLocaleString()}</span>
      <span className="chase-stat glass"><span className="eyebrow">Level</span>{hud.level}</span>
      <span className="chase-stat glass" aria-label={`${hud.lives} lives`}><span className="eyebrow">Lives</span>{"●".repeat(Math.max(0, hud.lives)) || "—"}</span>
    </div>
    <div className="chase-board glass" ref={frameRef} tabIndex={0} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={() => { touch.current = null; }}>
      <canvas ref={canvasRef} role="img" aria-label="Maze board"/>
      {overlay && <div className="chase-overlay" role="status">
        {overlay === "ready" && <><p className="eyebrow">{hud.score ? "Shake it off" : "Ready"}</p><h2>Press an arrow key or swipe</h2><p>Eat the confetti. Grab a party hat and the chasers turn catchable.</p></>}
        {overlay === "paused" && <><p className="eyebrow">Paused</p><h2>Take a breather</h2><button type="button" className="button glass" onClick={() => gameRef.current && togglePause(gameRef.current)}>Resume</button></>}
        {overlay === "cleared" && <><p className="eyebrow">Level {hud.level} cleared</p><h2>Party&rsquo;s still going</h2></>}
        {overlay === "over" && <><p className="eyebrow">Game over</p><h2>{hud.score.toLocaleString()} points</h2><p>{earned ? `+${earned} ticket${earned === 1 ? "" : "s"} added to your wallet` : `Score ${POINTS_PER_TICKET} points to earn a ticket`}</p>
          <div className="chase-actions"><button type="button" className="button glass" onClick={() => start(hero)}>Play again</button><button type="button" className="button glass" onClick={() => setHero(null)}>Switch player</button></div></>}
      </div>}
    </div>
    <div className="chase-pad" aria-label="Direction controls">
      <button type="button" className="glass" aria-label="Up" onClick={() => press("up")}>↑</button>
      <button type="button" className="glass" aria-label="Left" onClick={() => press("left")}>←</button>
      <button type="button" className="glass" aria-label="Down" onClick={() => press("down")}>↓</button>
      <button type="button" className="glass" aria-label="Right" onClick={() => press("right")}>→</button>
    </div>
    <p className="chase-help">Arrows or WASD to move · Space to pause · {POINTS_PER_TICKET} points = 1 ticket</p>
  </section>;
}

function draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, game: Game, faces: HTMLImageElement[], hero: number, chaserFaces: number[], now: number) {
  const ratio = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth;
  const tile = cssWidth / game.width;
  const cssHeight = tile * game.height;
  if (canvas.width !== Math.round(cssWidth * ratio) || canvas.height !== Math.round(cssHeight * ratio)) {
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    canvas.style.height = `${cssHeight}px`;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  // Walls: soft glass fill with a hairline only where a wall meets open floor.
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = 0; y < game.height; y++) for (let x = 0; x < game.width; x++) {
    if (isOpen(game, x, y)) continue;
    ctx.fillRect(x * tile, y * tile, tile, tile);
    const inset = tile * 0.18, l = x * tile, t = y * tile, r = l + tile, b = t + tile;
    if (isOpen(game, x, y - 1)) { ctx.moveTo(l, t + inset); ctx.lineTo(r, t + inset); }
    if (isOpen(game, x, y + 1)) { ctx.moveTo(l, b - inset); ctx.lineTo(r, b - inset); }
    if (isOpen(game, x - 1, y)) { ctx.moveTo(l + inset, t); ctx.lineTo(l + inset, b); }
    if (isOpen(game, x + 1, y)) { ctx.moveTo(r - inset, t); ctx.lineTo(r - inset, b); }
  }
  ctx.stroke();

  // Pickups: tumbling confetti flecks and party hats.
  for (let y = 0; y < game.height; y++) for (let x = 0; x < game.width; x++) {
    const cell = game.cells[y][x], cx = (x + 0.5) * tile, cy = (y + 0.5) * tile;
    if (cell === "confetti") {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((x * 37 + y * 53) % 6 + now / 900);
      ctx.fillStyle = CONFETTI[(x * 7 + y * 13) % CONFETTI.length];
      ctx.fillRect(-tile * 0.11, -tile * 0.05, tile * 0.22, tile * 0.1);
      ctx.restore();
    } else if (cell === "hat") {
      const bob = Math.sin(now / 250 + x) * tile * 0.06, h = tile * 0.62, w = tile * 0.46;
      ctx.save();
      ctx.translate(cx, cy + bob);
      ctx.beginPath(); ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath();
      ctx.fillStyle = "#ff8fd1"; ctx.fill();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1, tile * 0.05);
      ctx.beginPath(); ctx.moveTo(-w * 0.32, h * 0.14); ctx.lineTo(w * 0.32, h * 0.14); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -h / 2, tile * 0.08, 0, Math.PI * 2); ctx.fillStyle = "#ffd36e"; ctx.fill();
      ctx.restore();
    }
  }

  const at = (m: Mover, isPlayer: boolean) => {
    const t = progress(game, m, isPlayer);
    return { x: (m.fromX + (m.x - m.fromX) * t + 0.5) * tile, y: (m.fromY + (m.y - m.fromY) * t + 0.5) * tile };
  };

  game.chasers.forEach((chaser, i) => {
    const { x, y } = at(chaser, false);
    const waiting = chaser.wait > 0;
    const flashing = chaser.scared && game.frightened < 2 && Math.floor(now / 160) % 2 === 0;
    const wobble = chaser.scared ? Math.sin(now / 90 + i) * 0.25 : 0;
    drawFace(ctx, faces[chaserFaces[i]], x, y, tile * 1.7, wobble, chaser.dir === "left", {
      alpha: waiting ? 0.55 : 1,
      ring: chaser.scared ? (flashing ? "#ffffff" : "#8fe3ff") : "#ff6b6b",
      tint: chaser.scared ? "grayscale(1) sepia(1) hue-rotate(160deg) saturate(2.5)" : null,
    });
  });

  const player = at(game.player, true);
  const caught = game.status === "caught";
  const size = tile * 1.8 * (caught ? Math.max(0.2, game.pause / 1.4) : 1 + Math.sin(now / 140) * 0.03);
  drawFace(ctx, faces[hero], player.x, player.y, size, caught ? now / 120 : 0, game.player.dir === "left", { alpha: 1, ring: "#ffd36e", tint: null });
}

function drawFace(ctx: CanvasRenderingContext2D, img: HTMLImageElement | undefined, x: number, y: number, size: number, rotate: number, flip: boolean,
  { alpha, ring, tint }: { alpha: number; ring: string; tint: string | null }) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rotate);
  // A soft coloured halo tells players apart from chasers at a glance.
  ctx.shadowColor = ring;
  ctx.shadowBlur = size * 0.35;
  if (flip) ctx.scale(-1, 1);
  if (img?.complete && img.naturalWidth) {
    if (tint) ctx.filter = tint;
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
  } else {
    ctx.beginPath(); ctx.arc(0, 0, size * 0.35, 0, Math.PI * 2); ctx.fillStyle = ring; ctx.fill();
  }
  ctx.restore();
}
