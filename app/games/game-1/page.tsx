import type { Metadata } from "next";
import Link from "next/link";
import { ConfettiChase } from "@/components/ConfettiChase";
export const metadata: Metadata = { title: "Confetti Chase · Hot Welcome Arcade" };
export default function ConfettiChasePage() {
  return <main className="chase-page"><section className="hero chase-hero"><p className="eyebrow">Game 1</p><h1>Confetti Chase</h1></section><ConfettiChase/><Link className="button glass" href="/">← Back to games</Link></main>;
}
