import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";

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

  const tabStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "76px",
    minHeight: "38px",
    padding: "8px 13px",
    border: "1px solid #d9e3f5",
    borderRadius: "999px",
    fontFamily: "Noto Sans KR, Noto Sans JP, sans-serif",
    fontSize: "13px",
    fontWeight: 800,
    textDecoration: "none",
    boxShadow: "0 8px 24px rgba(47,111,255,.08)",
  } as const;

  return (
    <html lang="ko">
      <body>
        <nav
          aria-label="학습 메뉴"
          style={{
            width: "min(1180px, calc(100% - 28px))",
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
              ...tabStyle,
              background: "#2f6fff",
              borderColor: "#2f6fff",
              color: "#ffffff",
            }}
          >
            단어장
          </a>
          <a
            href={`${basePath}/reading/`}
            style={{
              ...tabStyle,
              background: "#ffffff",
              color: "#1d2127",
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
