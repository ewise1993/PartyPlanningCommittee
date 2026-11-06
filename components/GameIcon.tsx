import Image from "next/image";

const icons: Record<string, string> = {
  "game-1": "/icons/confetti-chase.png",
  "game-2": "/icons/pinball.png",
  "traffic-jam": "/icons/traffic-jam-solid.png",
};

export function GameIcon({ slug }: { slug: string }) {
  const src = icons[slug];
  if (!src) return null;
  return <Image className={`game-icon${slug === "game-2" ? " game-icon-wizard" : ""}`} src={src} width={140} height={140} alt="" aria-hidden="true" />;
}
