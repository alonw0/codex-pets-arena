import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Codex Pet Arena",
  description: "Realtime turn-based battles for hatched Codex pets."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link href="/arena.css" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
