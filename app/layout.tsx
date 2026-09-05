import type { Metadata } from "next";
import { Geist, Geist_Mono, Caveat } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Handwriting-style font for results
const caveat = Caveat({
  variable: "--font-handwriting",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Spatial Math Notes",
  description: "Draw math expressions and get instant results - like Apple Math Notes",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable} antialiased`}
      >
        {children}
        <a
          href="https://anuragjha.me"
          target="_blank"
          rel="author"
          className="fixed bottom-3 right-4 z-[9999] text-[11px] text-zinc-400 hover:text-zinc-800 font-mono transition-colors"
        >
          by Anurag Jha
        </a>
      </body>
    </html>
  );
}
