import Link from "next/link";
import { notFound } from "next/navigation";
import { games } from "@/lib/games";
// Games with a dedicated route under app/games/<slug>/ are served by that route instead.
export function generateStaticParams() { return games.filter((game) => !game.ready).map(({ slug }) => ({ slug })); }
export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = games.find((item) => item.slug === slug);
  if (!game) notFound();
  return <main className="placeholder"><p className="eyebrow">{game.title}</p><h1>Coming soon</h1><p>This game is getting ready for its first player.</p><Link className="button glass" href="/">← Back to games</Link></main>;
}
