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
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  return (
    <html lang="ko">
      <body>
        <nav
          aria-label="학습 메뉴"
          style={{
            width: "min(1540px, calc(100% - 44px))",
            margin: "18px auto 0",
            display: "flex",
            gap: "8px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <a
            href={`${basePath}/`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "38px",
              padding: "8px 13px",
              border: "1.5px solid #6093ad",
              borderRadius: "999px",
              background: "#20b9cf",
              color: "#07121f",
              fontFamily: "Galmuri11, Noto Sans KR, Noto Sans JP, sans-serif",
              fontSize: "13px",
              fontWeight: 900,
              textDecoration: "none",
            }}
          >
            단어장
          </a>
          <a
            href={`${basePath}/reading/`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "38px",
              padding: "8px 13px",
              border: "1.5px solid #6093ad",
              borderRadius: "999px",
              background: "#0c2031",
              color: "#e8f3f4",
              fontFamily: "Galmuri11, Noto Sans KR, Noto Sans JP, sans-serif",
              fontSize: "13px",
              fontWeight: 900,
              textDecoration: "none",
            }}
          >
            독해
          </a>
        </nav>
        {children}
      </body>
    </html>
  );
}
