import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Workflow Orchestration Console",
  description:
    "Configure versioned workflows, submit requests, and inspect execution traces from one admin console.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
