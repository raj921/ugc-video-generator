import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Result — AI UGC Studio | Product to Scroll-Stopping Video",
  description:
    "Paste a product link or pitch. DeepSeek directs, Pexels + GIPHY supply the B-roll, Creatomate exports a scroll-stopping 9:16 UGC cut — in under a minute.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} dark`}
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
