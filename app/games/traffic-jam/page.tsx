"use client";
import Link from "next/link";
import { VehicleClips, VehicleEdge } from "./VehicleClips";
import { useEffect, useRef, useState } from "react";
import { useTickets } from "@/components/TicketProvider";
import { initialCars, moveCar, isSolved, validCars, type Car } from "./puzzle";
import styles from "./styles.module.css";
export default function TrafficJam() {
  const [cars, setCars] = useState<Car[]>(initialCars);
  const [selected, setSelected] = useState("You");
  const [history, setHistory] = useState<Car[][]>([]);
  const [message, setMessage] = useState("Select a car to move it.");
  const [loaded, setLoaded] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const lastAction = useRef(0);
  const progressKey = "traffic-jam:progress:v1";
  const awardId = "traffic-jam:puzzle-1";
  const rewardLock = useRef(false);
  const { awardTicketsOnce, hasAward, ready } = useTickets();
  const rewarded = hasAward(awardId);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(progressKey) ?? "null");
      if (saved && validCars(saved.cars) && Array.isArray(saved.history) && saved.history.every(validCars)) {
        setCars(saved.cars); setHistory(saved.history);
        setSelected(initialCars.some(c => c.id === saved.selected) ? saved.selected : "You");
        setMessage("Your saved puzzle has been restored.");
      }
    } catch { setMessage("Saved progress could not be loaded. Starting a new puzzle."); }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(progressKey, JSON.stringify({ cars, history, selected })); }
    catch { setMessage("Progress cannot be saved in this browser. Keep this page open to continue."); }
  }, [cars, history, selected, loaded]);
  function acceptAction() {
    const now = performance.now();
    if (now - lastAction.current < 300) return false;
    lastAction.current = now;
    return true;
  }
  const solved = isSolved(cars);
  const car = cars.find(c => c.id === selected)!;
  function move(direction: number) {
    if (!loaded || solved || !acceptAction()) return;
    const next = moveCar(cars, selected, direction);
    if (!next) { setMessage("That car is blocked."); return; }
    setHistory([...history, cars]); setCars(next);
    setMessage(isSolved(next) ? "You cleared the traffic jam!" : `${selected === "You" ? "Your car" : `Car ${selected}`} moved.`);
  }
  async function claim() {
    if (!solved || rewardLock.current || rewarded || !ready) return;
    rewardLock.current = true; setClaiming(true);
    const success = await awardTicketsOnce(awardId, 25);
    setClaiming(false); rewardLock.current = false;
    setMessage(success ? "25 tickets added to your wallet." : "Reward already collected, or wallet storage is unavailable. Your solved puzzle is saved.");
  }
  function undo() {
    if (!history.length || solved || !acceptAction()) return;
    setCars(history[history.length - 1]); setHistory(history.slice(0, -1)); setMessage("Last move undone.");
  }
  function restart() {
    if (!acceptAction()) return;
    setCars(initialCars); setHistory([]); setSelected("You"); setMessage("Puzzle reset. Collected rewards stay collected.");
  }
  function keyMove(e: React.KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
    const directions: Record<string, number> = car.axis === "h" ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 };
    if (e.key in directions) { e.preventDefault(); move(directions[e.key]); }
  }
  if (!loaded) return <main className={styles.page}><p role="status">Loading your puzzle…</p></main>;
  return <main className={styles.page} onKeyDown={keyMove}><VehicleClips/><div className={styles.heading}><p className="eyebrow">Sliding puzzle</p><h1>Traffic Jam</h1><p>Slide the cars along their lanes. Get your car to the exit on the right.</p></div><div className={styles.mobileControls} aria-label="Mobile movement controls"><button disabled={solved || !moveCar(cars, selected, -1)} onClick={() => move(-1)}>{car.axis === "h" ? "Move left" : "Move up"}</button><button disabled={solved || !moveCar(cars, selected, 1)} onClick={() => move(1)}>{car.axis === "h" ? "Move right" : "Move down"}</button><span>{history.length} moves</span></div><div className={styles.layout}><section className={styles.boardPanel} aria-label="Traffic Jam puzzle"><div className={styles.exit}>EXIT</div><div className={styles.board}>
    {Array.from({length:36}, (_,i) => <div key={i} className={styles.cell} style={{gridColumn:i%6+1,gridRow:Math.floor(i/6)+1}} aria-hidden="true"/>)}
    {cars.map(c => <button key={c.id} className={`${styles.car} ${styles[`vehicle${c.id}`]} ${c.axis === "h" ? styles.horizontal : styles.vertical} ${c.id === "You" ? styles.target : ""}`} style={{ gridColumn: `${c.x+1} / span ${c.axis === "h" ? c.length : 1}`, gridRow: `${c.y+1} / span ${c.axis === "v" ? c.length : 1}` }} aria-label={`${c.id === "You" ? "Your car" : `Car ${c.id}`}, ${c.axis === "h" ? "horizontal" : "vertical"}, row ${c.y+1}, column ${c.x+1}`} aria-pressed={selected === c.id} onFocus={() => setSelected(c.id)} onClick={() => { setSelected(c.id); setMessage("Use the controls to move the selected car."); }}><span className={styles.carSurface} aria-hidden="true"/><VehicleEdge id={c.id} className={styles.carEdge}/><span className={styles.carLabel}>{c.id === "You" ? "You" : null}</span></button>)}
    </div></section><section className={styles.controls} aria-label="Game controls"><p className="eyebrow">{solved ? "Road clear" : "Find your way out"}</p><h2>{solved ? "Nicely done." : `${history.length} moves`}</h2><div className={styles.actions}><button disabled={solved || !moveCar(cars, selected, -1)} onClick={() => move(-1)}>{car.axis === "h" ? "Move left" : "Move up"}</button><button disabled={solved || !moveCar(cars, selected, 1)} onClick={() => move(1)}>{car.axis === "h" ? "Move right" : "Move down"}</button></div><p>Use the movement buttons or your keyboard’s arrow keys after selecting a car.</p><p role="status" aria-live="polite">{message}</p>{solved && <button disabled={!ready || rewarded || claiming} onClick={claim}>{rewarded ? "25 tickets collected" : claiming ? "Collecting…" : "Collect 25 tickets"}</button>}<div className={styles.actions}><button disabled={!history.length || solved} onClick={undo}>Undo</button><button onClick={restart}>Restart</button></div><p>25 tickets for your first solve of this puzzle. Replays are for practice.</p><Link className={styles.backButton} href="/">Back to games</Link></section></div></main>;
}
