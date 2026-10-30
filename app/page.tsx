import Link from "next/link";
import { games } from "@/lib/games";
export default function Home() {
  return <main><section className="hero"><h1>Arcade</h1></section><section aria-labelledby="games-heading"><div className="section-heading"><h2 id="games-heading" className="eyebrow">Game catalogue</h2></div><div className="game-grid">{games.map((game) => <Link className="game-card glass" href={`/games/${game.slug}`} key={game.slug}><span className="card-arrow arrow" aria-hidden="true">↗</span><div className="arcade-art" aria-hidden="true"><span/><span/><span/><span/><span/></div><div className="card-copy"><p className="eyebrow">{game.ready ? "Play now" : "Coming soon"}</p><h2>{game.title}</h2><p>{game.blurb}</p></div></Link>)}</div></section><Link href="/shop" className="shop-strip glass"><div><h2>The Prize Shop</h2><p>Your next reward is coming soon.</p></div><span className="circle-arrow" aria-hidden="true">↗</span></Link></main>;
}
