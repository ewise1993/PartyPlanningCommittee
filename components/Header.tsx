"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTickets } from "./TicketProvider";
export function Header() {
  const { tickets, ready } = useTickets();
  const inArcade = usePathname() !== "/";
  return <header className="site-header"><a className="catalogue-back glass" href={inArcade ? "/" : (process.env.NEXT_PUBLIC_PROTOTYPE_CATALOGUE_URL ?? "http://localhost:3000/")} title={inArcade ? "Back to Arcade" : "Return to Workshop Catalogue"}><span className="catalogue-arrow" aria-hidden="true">←</span><span>{inArcade ? "ARCADE | HOME" : "WORKSHOP CATALOGUE | HOME"}</span></a><nav aria-label="Main navigation"><Link className="nav-link" href="/">Games</Link><Link className="nav-link" href="/shop">Prize shop</Link><span className="wallet glass" role="status" aria-live="polite"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4V7Z"/><path d="M15 7v2m0 2v2m0 2v2"/></svg>{ready ? tickets.toLocaleString() : "—"} tickets</span></nav></header>;
}
