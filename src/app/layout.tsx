import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Webster Free — Ad-Free Dictionary",
  description:
    "A clean, ad-free, Merriam-Webster-style dictionary. Look up definitions, etymology, synonyms, antonyms, and more — no ads, no tracking, no clutter.",
  keywords: [
    "dictionary",
    "ad-free",
    "definitions",
    "etymology",
    "synonyms",
    "word of the day",
  ],
  authors: [{ name: "Webster Free" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Webster Free — Ad-Free Dictionary",
    description: "A clean, ad-free Merriam-Webster-style dictionary.",
    siteName: "Webster Free",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
