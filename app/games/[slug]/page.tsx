import Link from "next/link";
import { notFound } from "next/navigation";
import { games } from "@/lib/games";
export function generateStaticParams() { return games.map(({ slug }) => ({ slug })); }
export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = games.find((item) => item.slug === slug);
  if (!game) notFound();
  return <main className="placeholder"><p className="eyebrow">{game.title}</p><h1>Coming soon</h1><p>This game is getting ready for its first player.</p><Link className="button glass" href="/">Back to games</Link></main>;
}
