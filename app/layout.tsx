import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import "./m9.css";

export const metadata: Metadata = {
  title: "TrophyBridge",
  description:
    "A privacy-first bridge between PlayStation trophy data and AI-assisted platinum tracking.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
