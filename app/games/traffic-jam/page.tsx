"use client";
import { VehicleClips, VehicleEdge } from "./VehicleClips";
import { useEffect, useRef, useState } from "react";
import { useTickets } from "@/components/TicketProvider";
import { initialCars, moveCar, isSolved, validCars, type Car } from "./puzzle";
import { gridSize, type Level } from "./levels";
import styles from "./styles.module.css";
const FIRST: Level = { number: 1, size: 6, cars: initialCars, solution: [] };
const KEY = "traffic-jam:progress:v2";
type Game = { level: Level; cars: Car[]; history: Car[][]; selected: string };
const start = (level: Level): Game => ({ level, cars: level.cars, history: [], selected: "You" });
function validLevel(value: unknown): value is Level {
  const l = value as Level | null;
  if (!l || !Number.isSafeInteger(l.number) || l.number < 1 || l.size !== gridSize(l.number) || !Array.isArray(l.cars) || !Array.isArray(l.solution)) return false;
  if (!l.cars.every(c => c && typeof c.id === "string" && (c.axis === "h" || c.axis === "v") && (c.length === 2 || c.length === 3)) || l.cars.filter(c=>c.id === "You" && c.axis === "h" && c.length === 2).length !== 1) return false;
  return validCars(l.cars,l.size,l.cars);
}
export default function TrafficJam() {
  const [game, setGame] = useState<Game>(() => start(FIRST));
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState("Select a car to move it.");
  const lastAction = useRef(0), sequence = useRef(0), advancing = useRef(false);
  const worker = useRef<Worker | null>(null);
  const { awardTicketsOnce, hasAward, ready } = useTickets();
  const { level, cars, history, selected } = game;
  const solved = isSolved(cars,level.size);
  const car = cars.find(c => c.id === selected) ?? cars[0];
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (saved && validLevel(saved.level) && validCars(saved.cars,saved.level.size,saved.level.cars) && Array.isArray(saved.history) && saved.history.every((h: unknown)=>validCars(h,saved.level.size,saved.level.cars))) {
        setGame({ ...saved, selected: saved.cars.some((c: Car)=>c.id===saved.selected) ? saved.selected : "You" });
        setMessage(`Level ${saved.level.number} restored.`);
      } else {
        const old = JSON.parse(localStorage.getItem("traffic-jam:progress:v1") ?? "null");
        if (old && validCars(old.cars) && Array.isArray(old.history) && old.history.every((h: unknown)=>validCars(h))) setGame({...start(FIRST), cars:old.cars,history:old.history});
      }
    } catch { setMessage("Starting a fresh game; saved progress could not be loaded."); }
    setLoaded(true);
    return () => { sequence.current++; worker.current?.terminate(); };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(KEY,JSON.stringify(game)); }
    catch { setMessage("Progress cannot be saved in this browser. Keep this page open to continue."); }
  }, [game,loaded]);
  async function advanceLevel() {
    if (advancing.current || !ready) return;
    advancing.current=true; setBusy(true); setError(false);
    const token=++sequence.current;
    const id=level.number===1 ? "traffic-jam:puzzle-1" : `traffic-jam:level-${level.number}`;
    const already=hasAward(id);
    const paid=already || await awardTicketsOnce(id,25);
    if(token!==sequence.current) return;
    if(!paid) { advancing.current=false;setBusy(false);setError(true);setMessage("Your win is saved. The wallet could not confirm the reward; retry to continue.");return; }
    setMessage(`Level ${level.number} cleared${already ? "" : ". 25 tickets earned"}. Preparing level ${level.number+1}…`);
    const nextWorker=new Worker(new URL("./level.worker.ts",import.meta.url));worker.current=nextWorker;
    const fail=()=>{if(token!==sequence.current)return;nextWorker.terminate();advancing.current=false;setBusy(false);setError(true);setMessage("Your win and tickets are saved. Retry to generate the next level.");};
    nextWorker.onerror=fail;
    nextWorker.onmessage=(event: MessageEvent<{level?:Level;error?:string}>)=>{
      if(token!==sequence.current)return;
      if(!event.data.level || !validLevel(event.data.level)){fail();return;}
      nextWorker.terminate(); worker.current=null;advancing.current=false;
      setGame(start(event.data.level));setBusy(false);
      setMessage(`Level ${event.data.level.number}. ${event.data.level.size} by ${event.data.level.size} grid. Clear the next traffic jam.`);
    };
    nextWorker.postMessage(level.number+1);
  }
  useEffect(() => { if(loaded && solved && ready && !error) void advanceLevel(); }, [loaded,solved,ready,level.number,error]); // Completion guard prevents duplicate workers and rewards.
  function acceptAction(){const now=performance.now();if(now-lastAction.current<200)return false;lastAction.current=now;return true;}
  function move(direction:number){
    if(!loaded || busy || solved || !acceptAction())return;
    const next=moveCar(cars,selected,direction,level.size);
    if(!next){setMessage("That car is blocked.");return;}
    setGame({...game,cars:next,history:[...history,cars]});
    if(isSolved(next,level.size))setMessage(`Level ${level.number} cleared!`);
  }
  function reset(giveUp:boolean){
    if(!acceptAction())return;
    sequence.current++;worker.current?.terminate();worker.current=null;advancing.current=false;setBusy(false);setError(false);
    setGame(start(giveUp?FIRST:level));setMessage(giveUp?"Back to level 1. Your earned tickets are kept.":`Level ${level.number} restarted.`);
  }
  function keyMove(e:React.KeyboardEvent){
    if(e.altKey||e.ctrlKey||e.metaKey||e.repeat)return;
    const directions:Record<string,number>=car.axis==="h"?{ArrowLeft:-1,ArrowRight:1}:{ArrowUp:-1,ArrowDown:1};
    if(e.key in directions){e.preventDefault();move(directions[e.key]);}
  }
  const movement = <><button disabled={busy||solved||!moveCar(cars,selected,-1,level.size)} onClick={()=>move(-1)}>{car.axis==="h"?"Move left":"Move up"}</button><button disabled={busy||solved||!moveCar(cars,selected,1,level.size)} onClick={()=>move(1)}>{car.axis==="h"?"Move right":"Move down"}</button></>;
  if(!loaded)return <main className={styles.page}><p role="status">Loading your puzzle…</p></main>;
  return <main className={styles.page} onKeyDown={keyMove}><VehicleClips/><div className={styles.heading}><h1>Traffic Jam</h1><p>Slide the cars along their lanes. Get your car to the exit on the right.<br/>Select a car, then use the movement buttons or your keyboard’s arrow keys.</p></div><div className={styles.mobileControls} aria-label="Mobile movement controls">{movement}<span>Level {level.number}</span></div><div className={styles.layout}><section className={styles.boardPanel} aria-label={`Traffic Jam level ${level.number}`}><div className={styles.boardScroll}><div className={styles.board} style={{gridTemplateColumns:`repeat(${level.size},minmax(0,1fr))`,gridTemplateRows:`repeat(${level.size},minmax(0,1fr))`,minWidth:level.size*44+(level.size-1)*4}} aria-busy={busy}>
    {Array.from({length:level.size*level.size},(_,i)=><div key={i} className={styles.cell} style={{gridColumn:i%level.size+1,gridRow:Math.floor(i/level.size)+1}} aria-hidden="true"/>)}
    {cars.map((c,i)=>{const skin=c.id==="You"?"You":c.axis==="h"?["B","D","E"][i%3]:["A","C"][i%2];return <button key={c.id} className={`${styles.car} ${styles[`vehicle${skin}`]}`} style={{gridColumn:`${c.x+1} / span ${c.axis==="h"?c.length:1}`,gridRow:`${c.y+1} / span ${c.axis==="v"?c.length:1}`}} aria-label={`${c.id==="You"?"Your car":`Car ${i}`}, ${c.axis==="h"?"horizontal":"vertical"}, row ${c.y+1}, column ${c.x+1}`} aria-pressed={selected===c.id} disabled={busy} onFocus={()=>setGame(g=>({...g,selected:c.id}))} onClick={()=>setGame(g=>({...g,selected:c.id}))}><span className={styles.carSurface} aria-hidden="true"/><VehicleEdge id={skin} className={styles.carEdge}/><span className={styles.carLabel}>{c.id==="You"?"You":null}</span></button>;})}<span className={styles.levelExit} style={{gridColumn:level.size,gridRow:cars[0].y+1}} aria-hidden="true">EXIT</span>
    </div></div></section><section className={styles.controls} aria-label="Game controls"><p className="eyebrow">Level {level.number} | {level.size} × {level.size}</p><h2>{solved?"Road clear!":`${history.length} moves`}</h2><div className={styles.actions}>{movement}</div><p role="status" aria-live="polite">{message}</p>{error&&<button onClick={()=>void advanceLevel()}>Retry next level</button>}<div className={styles.actions}><button disabled={busy||solved||!history.length} onClick={()=>{if(!acceptAction())return;setGame({...game,cars:history[history.length-1],history:history.slice(0,-1)});}}>Undo</button><button disabled={busy} onClick={()=>reset(false)}>Restart level</button><button onClick={()=>reset(true)}>Give Up</button></div></section></div></main>;
}
