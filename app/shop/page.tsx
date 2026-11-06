"use client";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { useTickets } from "@/components/TicketProvider";
import { pies } from "@/lib/pies";
import styles from "./styles.module.css";
export default function Shop() {
  const { tickets, ready, redeemPrize, prizes } = useTickets();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const lastPurchase = useRef(0);
  const [filter, setFilter] = useState("all");
  const shown = pies.filter(p => filter !== "affordable" || p.tickets <= tickets);
  async function redeem(pie: typeof pies[number]) {
    if (busy.current || !ready || Date.now() - lastPurchase.current < 600) return;
    lastPurchase.current = Date.now();
    busy.current = true; setPending(pie.id);
    try {
      const success = await redeemPrize(pie.id);
      setMessage(success ? `${pie.name} collected for ${pie.tickets} tickets. Find it in your pie collection.` : "Unable to redeem. Check your ticket balance and browser storage, then try again.");
    } finally { busy.current = false; setPending(null); }
  }
  const count = Object.values(prizes).reduce((a,b) => a+b, 0);
  return <main className={styles.page}><section className={styles.hero}><h1>Pie Prizes</h1><p>Play for tickets. Leave with pie.</p></section><div className={styles.toolbar}><p>{ready ? `${tickets.toLocaleString()} tickets to spend` : "Loading your wallet…"}</p><div className={styles.filters} role="group" aria-label="Filter pies"><button className="glass" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All pies</button><button className="glass" aria-pressed={filter === "affordable"} disabled={!ready} onClick={() => setFilter("affordable")}>Within my tickets</button></div></div><p className={styles.status} role="status" aria-live="polite">{message}</p><section className={styles.grid} aria-label="Pie prizes">{shown.map(pie => <article key={pie.id} className={`${styles.card} glass`}><div className={styles.image}><Image src={pie.image} alt={`${pie.name}, whole pie`} fill sizes="(max-width:650px) 85vw, (max-width:1000px) 40vw, 28vw"/></div><div className={styles.copy}><p className="eyebrow">{pie.tickets} tickets</p><h2>{pie.name}</h2></div><button onClick={() => redeem(pie)} disabled={!ready || pending !== null || tickets < pie.tickets}>{pending === pie.id ? "Collecting…" : tickets < pie.tickets ? `${pie.tickets - tickets} more tickets needed` : "Redeem pie"}</button>{prizes[pie.id] > 0 && <p className={styles.owned}>{prizes[pie.id]} collected</p>}</article>)}</section>{shown.length === 0 && <div className={styles.empty}><h2>A little more play, then pie.</h2><p>The first pie costs 60 tickets. Earn some in the arcade or browse all pies.</p><Link className="button glass" href="/">Back to Arcade</Link></div>}<section className={styles.collection} aria-labelledby="collection-heading"><h2 id="collection-heading">Your Pie Collection</h2>{count ? <ul>{pies.filter(p=>prizes[p.id]).map(p=><li key={p.id}>{p.name}<span>{prizes[p.id]}</span></li>)}</ul> : <p>Your collected pies will appear here.</p>}</section></main>;
}
