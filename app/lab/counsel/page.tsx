import type { Metadata } from "next";
import { CounselChat } from "@/components/counsel/chat";
import { accents } from "@/components/content";

export const metadata: Metadata = {
  title: "KKEBI 상담 봇 — 테스트",
  description:
    "CBT 기반 음성·대화 상담 봇 테스트 페이지. 페르소나 선택 후 기억을 이어가며 대화합니다.",
};

const a = accents.kkebi;

export default function CounselLabPage() {
  return (
    <div
      style={
        {
          "--accent": a.accent,
          "--accent-strong": a.strong,
          "--accent-soft": a.soft,
        } as React.CSSProperties
      }
    >
      <CounselChat />
    </div>
  );
}
