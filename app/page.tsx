import Link from "next/link";
import { GameIcon } from "@/components/GameIcon";
import { games } from "@/lib/games";
export default function Home() {
  return <main><section className="hero"><h1>Arcade</h1></section><section aria-label="Arcade games"><div className="game-grid">{games.length === 0 && <p className="empty-catalogue" role="status">No games available yet. Check back soon.</p>}{games.map((game) => <Link className="game-card glass" href={`/games/${game.slug}`} key={game.slug}><GameIcon slug={game.slug}/><div className="card-copy"><h2>{game.title}</h2><p>{game.blurb ?? "A new game is on its way."}</p></div></Link>)}</div></section></main>;
}
