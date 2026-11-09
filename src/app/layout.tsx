import type { Metadata, Viewport } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import PwaBridge from "@/components/PwaBridge";

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lexica — The Ad-Free Dictionary",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Lexica",
  },
  formatDetection: {
    telephone: false,
  },
  // Next 16 emits only the standard "mobile-web-app-capable"; older iOS also
  // looks for the legacy Apple spelling, so emit it explicitly.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  description:
    "A clean, ad-free English dictionary. Look up definitions, IPA pronunciations, etymology, synonyms, antonyms, and a daily featured word — no ads, no tracking, no clutter.",
  keywords: [
    "dictionary",
    "ad-free",
    "definitions",
    "etymology",
    "synonyms",
    "word of the day",
  ],
  authors: [{ name: "Lexica" }],
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
    title: "Lexica — The Ad-Free Dictionary",
    description: "A clean, ad-free English dictionary.",
    siteName: "Lexica",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Lexica — The Ad-Free Dictionary",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lexica — The Ad-Free Dictionary",
    description: "A clean, ad-free English dictionary.",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#fbfaf7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${dmSans.variable} ${playfair.variable} antialiased bg-background text-foreground`}
      >
        <script defer src="/_vercel/insights/script.js" />
        {children}
        <Toaster />
        <PwaBridge />
      </body>
    </html>
  );
}
