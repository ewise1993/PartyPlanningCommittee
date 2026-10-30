import type { Metadata } from "next";
import { PinballGame } from "@/components/pinball/PinballGame";

export const metadata: Metadata = {
  title: "Pinball · Hot Welcome Arcade",
  description: "A retro pinball machine. Three balls, flashing lights, skill lanes, and a JACKPOT to spell.",
};

export default function PinballPage() {
  return <main><PinballGame /></main>;
}
