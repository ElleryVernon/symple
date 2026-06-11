/**
 * KKEBI 상담 봇 — 클라이언트/서버 공유 도메인 모델.
 * (상담 페르소나 정의 + 메시지 타입. 실제 응답은 OpenRouter 모델이 생성한다.)
 */

export type PersonaId = "empathy" | "solution" | "aligned";
export type Role = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  /** 모델 reasoning(생각) — assistant 메시지에만 */
  reasoning?: string;
  /** 스트리밍 진행 중 여부 */
  streaming?: boolean;
  /** reasoning(생각)에 걸린 시간(ms) — "N초 동안 생각했어요" 표시용 */
  thinkMs?: number;
  /** 사용자가 중단(stop)하거나 끼어들어(barge-in) 멈춘 응답인지 */
  interrupted?: boolean;
  /** 생성 중 오류가 발생한 응답인지 */
  error?: boolean;
}

/* ───────────────────────────────────────────── 상담 페르소나 (3종)
   프롬프트의 3가지 스타일을 KKEBI 캐릭터(webm)에 매핑합니다. */

export interface Persona {
  id: PersonaId;
  label: string;
  en: string;
  character: string;
  video: string;
  tagline: string;
  desc: string;
}

export const PERSONAS: Persona[] = [
  {
    id: "empathy",
    label: "공감형",
    en: "Empathy-focused",
    character: "플라워깨비",
    video: "/characters/FLOWERMON.webm",
    tagline: "감정을 충분히 듣고 함께 머무릅니다",
    desc: "지금의 감정을 판단 없이 들어드려요. 마음이 가는 속도에 맞춰 천천히 이야기해요.",
  },
  {
    id: "solution",
    label: "해결중심형",
    en: "Solution-focused",
    character: "아이스깨비",
    video: "/characters/ICEMON.webm",
    tagline: "상황을 정리하고 다음 한 걸음을 찾습니다",
    desc: "막막한 상황을 차분히 정리하고, 지금 해볼 수 있는 작은 실천을 함께 찾아요.",
  },
  {
    id: "aligned",
    label: "감정동조형",
    en: "Aligned expression",
    character: "파이어깨비",
    video: "/characters/Firemon.webm",
    tagline: "억눌린 감정을 같이 꺼내 표현합니다",
    desc: "답답하고 화났던 마음, 혼자 누르지 않도록 곁에서 같이 표현하고 풀어내요.",
  },
];

export const personaById = (id: PersonaId): Persona =>
  PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
