import type { Metadata } from "next";
import { Geist } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Autohospedada: Manrope también es variable font, Google sirve el MISMO
// archivo para los pesos 500/600/700/800 (mismo problema que Playfair, ver
// comentario abajo).
const manrope = localFont({
  src: "../fonts/Manrope-Variable-latin.woff2",
  variable: "--font-manrope",
  weight: "500 800",
  display: "swap",
});

// Autohospedada (no next/font/google): Google sirve el MISMO archivo variable
// para los pesos 500/600/700/800, y eso rompe la resolución de next/font con
// Turbopack en un build sin caché previa (Docker) con "next/font/google
// queries have exactly one entry".
const playfair = localFont({
  src: "../fonts/PlayfairDisplay-Variable-latin.woff2",
  variable: "--font-playfair",
  weight: "500 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Carnes Santacruz — Acceso",
  description: "Sistema de pedidos de Carnes Santacruz. Vendemos vida.",
  icons: {
    icon: "/LOGOCARNESSANTACRUZ.png",
    shortcut: "/LOGOCARNESSANTACRUZ.png",
    apple: "/LOGOCARNESSANTACRUZ.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${playfair.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
