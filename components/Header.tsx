"use client";
import Link from "next/link";
import { useTickets } from "./TicketProvider";
export function Header() {
  const { tickets, ready } = useTickets();
  return <header className="site-header"><Link className="brand" href="/">Hot Welcome Arcade</Link><nav aria-label="Main navigation"><Link className="nav-link" href="/">Games</Link><Link className="nav-link" href="/shop">Prize shop</Link><span className="wallet glass" role="status" aria-live="polite"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4V7Z"/><path d="M15 7v2m0 2v2m0 2v2"/></svg>{ready ? tickets.toLocaleString() : "—"} tickets</span></nav></header>;
}
