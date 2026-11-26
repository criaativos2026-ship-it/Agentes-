import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Semi_Condensed } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-barlow", display: "swap" });
const barlowSemi = Barlow_Semi_Condensed({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-barlow-semi", display: "swap" });

export const metadata: Metadata = {
  title: { default: "NEXUS AI", template: "%s · NEXUS AI" },
  description: "Plataforma de agentes de inteligência artificial personalizados para empresas.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#FFFFFF", colorScheme: "light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${barlow.variable} ${barlowSemi.variable}`}>
      <body className="min-h-dvh font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
