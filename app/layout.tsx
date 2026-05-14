import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { ArenaHeartbeat } from "@/components/ArenaHeartbeat";
import { getPublicSiteUrl } from "@/lib/share";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getPublicSiteUrl()),
  title: "Codex Pet Arena",
  description: "Realtime turn-based battles for hatched Codex pets.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [
      { rel: "manifest", url: "/site.webmanifest" }
    ]
  },
  openGraph: {
    title: "Codex Pet Arena",
    description: "Hatch a Codex pet, train it, and throw down in realtime arena battles.",
    images: [{ url: "/codex-pet-arena-logo.png", width: 1672, height: 941, alt: "Codex Pet Arena" }],
    siteName: "Codex Pet Arena",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Codex Pet Arena",
    description: "Hatch a Codex pet, train it, and throw down in realtime arena battles.",
    images: ["/codex-pet-arena-logo.png"]
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link href="/arena.css" rel="stylesheet" />
      </head>
      <body>
        <ArenaHeartbeat />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
