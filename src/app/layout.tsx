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
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-48.png", type: "image/png", sizes: "48x48" },
      { url: "/favicon-64.png", type: "image/png", sizes: "64x64" },
      { url: "/favicon-128.png", type: "image/png", sizes: "128x128" },
      { url: "/favicon-256.png", type: "image/png", sizes: "256x256" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
  },
  openGraph: {
    title: "Webster Free — Ad-Free Dictionary",
    description: "A clean, ad-free Merriam-Webster-style dictionary.",
    siteName: "Webster Free",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Webster Free — Ad-Free Dictionary",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Webster Free — Ad-Free Dictionary",
    description: "A clean, ad-free Merriam-Webster-style dictionary.",
    images: ["/og-image.png"],
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
