import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ALPHA TERMINAL — Simulated markets, real discipline",
  description: "A premium market simulator for learning, testing, and competing with virtual capital.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
