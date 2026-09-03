import type { Metadata } from "next";
import { Source_Serif_4, Special_Elite } from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const bodyFont = Source_Serif_4({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const dossierFont = Special_Elite({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-dossier",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "DontGhostMe", template: "%s | DontGhostMe" },
  description: "A candidate-owned, evidence-based recruiter relationship tracker.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${dossierFont.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
