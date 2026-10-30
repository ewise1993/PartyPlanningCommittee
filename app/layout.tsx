import type { Metadata } from "next";
import localFont from "next/font/local";
import { Header } from "@/components/Header";
import { TicketProvider } from "@/components/TicketProvider";
import "./globals.css";
const safiro = localFont({ src: "../public/fonts/safiro.woff2", weight: "400", variable: "--font-safiro" });
export const metadata: Metadata = { title: "Hot Welcome Arcade", description: "Play together. Earn tickets. Pick a prize." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={safiro.variable}><div className="photo-background" aria-hidden="true"/><TicketProvider><div className="shell"><Header/>{children}<footer>HOT WELCOME STUDIO | ZIONA STUDIO | SASHKI PRODUCTIONS</footer></div></TicketProvider></body></html>;
}
