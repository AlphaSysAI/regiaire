import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import Link from "next/link";
import { 
  LayoutDashboard, 
  ScanLine, 
  Package,
  Users, 
  TrendingDown, // Import de l'icône pour AntiGaspi
  Calendar // Import de l'icône pour Planning
} from "lucide-react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RégiAire",
  description: "Optimisation et cohésion pour aires d'autoroute",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className={`${inter.className} bg-gray-50 text-gray-900`}>
        {/* Contenu principal de la page */}
        <main className="pb-20 min-h-screen">
          {children}
        </main>
        
        {/* Barre de navigation mobile fixe en bas */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-20 flex items-center justify-around px-2 z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
          
          <Link href="/" className="flex flex-col items-center justify-center space-y-1 text-orange-600">
            <LayoutDashboard size={24} />
            <span className="text-[10px] font-bold uppercase tracking-wide">Dashboard</span>
          </Link>

          <Link href="/scanner" className="flex flex-col items-center justify-center space-y-1 text-gray-400 hover:text-orange-500 transition-colors">
            <ScanLine size={24} />
            <span className="text-[10px] font-bold uppercase tracking-wide">Scanner</span>
          </Link>

          <Link href="/inventaire" className="flex flex-col items-center justify-center space-y-1 text-gray-400 hover:text-orange-500 transition-colors">
            <Package size={24} />
            <span className="text-[9px] font-bold uppercase tracking-wide">Stock</span>
          </Link>

          {/* NOUVEL ONGLET ANTIGASPI */}
          <Link href="/antigaspi" className="flex flex-col items-center justify-center space-y-1 text-gray-400 hover:text-orange-500 transition-colors">
            <TrendingDown size={24} />
            <span className="text-[10px] font-bold uppercase tracking-wide">AntiGaspi</span>
          </Link>

          <Link href="/equipe" className="flex flex-col items-center justify-center space-y-1 text-gray-400 hover:text-orange-500 transition-colors">
            <Users size={24} />
            <span className="text-[10px] font-bold uppercase tracking-wide">Équipe</span>
          </Link>

          <Link href="/planning" className="flex flex-col items-center justify-center space-y-1 text-gray-400 hover:text-orange-500 transition-colors">
            <Calendar size={24} />
            <span className="text-[10px] font-bold uppercase tracking-wide">Planning</span>
          </Link>

        </nav>
      </body>
    </html>
  );
}