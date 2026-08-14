import type { Metadata } from "next";
import "./globals.css";
import { Outfit, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import {
  LayoutDashboard,
  ScanLine,
  Package,
  Users,
  TrendingDown,
  Calendar,
} from "lucide-react";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-display",
});

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "OrbitAire",
  description:
    "Plateforme d'intelligence opérationnelle pour aires de services et réseaux autoroutiers",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body
        className={`${outfit.variable} ${plex.variable} bg-slate-950 text-slate-100 antialiased`}
        style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
      >
        <main className="pb-20 min-h-screen">{children}</main>

        <nav className="fixed bottom-0 left-0 right-0 z-50 h-[4.5rem] border-t border-slate-800/80 bg-slate-950/95 backdrop-blur-md flex items-center justify-around px-1 shadow-[0_-8px_30px_rgba(0,0,0,0.35)]">
          <Link
            href="/"
            className="flex flex-col items-center gap-1 text-cyan-400"
          >
            <LayoutDashboard size={22} />
            <span className="text-[9px] font-semibold uppercase tracking-wide">
              Pilotage
            </span>
          </Link>
          <Link
            href="/scanner"
            className="flex flex-col items-center gap-1 text-slate-500 hover:text-cyan-300 transition-colors"
          >
            <ScanLine size={22} />
            <span className="text-[9px] font-semibold uppercase tracking-wide">
              Scanner
            </span>
          </Link>
          <Link
            href="/inventaire"
            className="flex flex-col items-center gap-1 text-slate-500 hover:text-cyan-300 transition-colors"
          >
            <Package size={22} />
            <span className="text-[9px] font-semibold uppercase tracking-wide">
              Stock
            </span>
          </Link>
          <Link
            href="/antigaspi"
            className="flex flex-col items-center gap-1 text-slate-500 hover:text-cyan-300 transition-colors"
          >
            <TrendingDown size={22} />
            <span className="text-[9px] font-semibold uppercase tracking-wide">
              AntiGaspi
            </span>
          </Link>
          <Link
            href="/equipe"
            className="flex flex-col items-center gap-1 text-slate-500 hover:text-cyan-300 transition-colors"
          >
            <Users size={22} />
            <span className="text-[9px] font-semibold uppercase tracking-wide">
              Équipe
            </span>
          </Link>
          <Link
            href="/planning"
            className="flex flex-col items-center gap-1 text-slate-500 hover:text-cyan-300 transition-colors"
          >
            <Calendar size={22} />
            <span className="text-[9px] font-semibold uppercase tracking-wide">
              Planning
            </span>
          </Link>
        </nav>
      </body>
    </html>
  );
}
