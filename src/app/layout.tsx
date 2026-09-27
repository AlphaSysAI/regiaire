import type { Metadata } from "next";
import "./globals.css";
import { Outfit, IBM_Plex_Sans } from "next/font/google";
import AppNav from "@/components/nav/AppNav";
import ProfileCompletionModal from "@/components/auth/ProfileCompletionModal";

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
    "Plateforme d'intelligence opérationnelle pour stations-service et retail autoroutier",
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
        <main className="min-h-screen pb-20">{children}</main>
        <AppNav />
        <ProfileCompletionModal />
      </body>
    </html>
  );
}
