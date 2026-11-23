import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "AOJ Engage", template: "%s · AOJ Engage" },
  description: "Customer communication management and broadcast centre of AOJ Global Concept Limited",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.png", apple: "/icon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={sans.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
