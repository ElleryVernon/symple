import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://symple.kr"),
  title: "SYMPLE — 데이터 기반 멘탈헬스테크",
  description:
    "SYMPLE은 음성·행동·대화 데이터를 바탕으로 정서 변화의 초기 신호를 포착하고 맞춤형 개입으로 연결합니다. KKEBI와 오리의 꿈으로 측정·개입·연결을 하나의 흐름으로 만듭니다.",
  keywords: ["SYMPLE", "심플", "KKEBI", "꺼비", "오리의 꿈", "멘탈헬스", "번아웃", "음성 분석", "디지털 바이오마커"],
  openGraph: {
    title: "SYMPLE — 데이터 기반 멘탈헬스테크",
    description:
      "음성·행동·대화 데이터로 마음 건강을 더 일찍, 더 정확하게. KKEBI · 오리의 꿈.",
    type: "website",
    locale: "ko_KR",
  },
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css"
        />
      </head>
      {/* suppressHydrationWarning: 일부 브라우저 확장(예: ColorZilla의 cz-shortcut-listen)이
          hydrate 전에 body 속성을 주입해 발생하는 경고만 무시 (한 단계 한정) */}
      <body className="min-h-full" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
