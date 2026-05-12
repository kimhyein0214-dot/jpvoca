import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "N1 Kanji Vocabulary",
  description: "A kanji-based Japanese vocabulary browser backed by Neon PostgreSQL.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
