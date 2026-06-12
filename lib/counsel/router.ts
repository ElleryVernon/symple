/**
 * 시나리오 라우터 — 사용자 발화를 가이드라인 분류체계로 매핑한다.
 *
 * 시나리오 500개를 프롬프트에 다 넣을 수 없으므로, 가벼운 LLM 분류 호출 1회로
 * 서브테마(50종) + 인지왜곡(10종)을 고르고, 그 조합으로 시나리오 1개를 결정한다
 * (시트 구조상 서브테마×왜곡 = 시나리오 1:1).
 *
 * 운영 원칙:
 * - 분류는 메인 응답 생성과 병렬로 돌고, 제한 시간 안에 못 오면 그 턴은
 *   미분류(인테이크 모드)로 진행한다. 늦게 도착한 결과는 세션에 저장돼
 *   다음 턴부터 적용된다 — 잘못된 시나리오 주입이 무(無)시나리오보다 나쁘다.
 * - 인사·잡담 등 주제가 불분명한 발화는 분류기가 스스로 null 을 반환한다.
 */

import { completeOnce } from "@/lib/openrouter";
import {
  CHIEF_COMPLAINTS,
  DISTORTIONS,
  DISTORTION_LABELS,
  SUBTHEMES,
  findScenario,
  isDistortion,
  isSubthemeCode,
  type CallScenario,
} from "./guidelines";

export interface ScenarioClassification {
  scenario: CallScenario;
  confidence: number;
}

/** 이 미만의 확신도는 미분류로 처리 — 오분류 시나리오 고착을 막는다 */
const MIN_CONFIDENCE = 0.4;
const MAX_INPUT_CHARS = 1500;
const CLASSIFY_HARD_TIMEOUT_MS = 10_000;

export const routerEnabled = () =>
  !!process.env.OPENROUTER_API_KEY?.trim() &&
  process.env.COUNSEL_ROUTER_ENABLED?.trim().toLowerCase() !== "false";

// 카탈로그는 불변 — 프롬프트 본문을 모듈 로드 시 1회 구성
const SUBTHEME_CATALOG = (() => {
  const byChief = new Map<string, string[]>();
  for (const s of SUBTHEMES) {
    const list = byChief.get(s.chief_complaint_code) ?? [];
    list.push(`${s.code} ${s.label_ko}`);
    byChief.set(s.chief_complaint_code, list);
  }
  return CHIEF_COMPLAINTS.filter((c) => byChief.has(c.code))
    .map((c) => `${c.label_ko}(${c.code}): ${byChief.get(c.code)!.join(" | ")}`)
    .join("\n");
})();

const DISTORTION_CATALOG = DISTORTIONS.map(
  (d) => `${d}: ${DISTORTION_LABELS[d]}`
).join("\n");

const CLASSIFIER_SYSTEM = `당신은 심리상담 발화 분류기입니다. 사용자의 상담 발화를 읽고 아래 카탈로그에서 가장 가까운 항목을 고릅니다.

[서브테마 카탈로그 — 주호소(코드): 서브테마코드 이름]
${SUBTHEME_CATALOG}

[인지왜곡 카탈로그 — 코드: 의미]
${DISTORTION_CATALOG}

반드시 JSON 객체 하나만 출력하세요. 다른 텍스트·설명·코드펜스 금지.
{"subtheme": "W01", "distortion": "catastrophizing", "confidence": 0.8}

규칙:
- subtheme 은 반드시 카탈로그에 있는 서브테마 코드 중 하나. 발화가 인사·잡담뿐이거나 주제가 불분명하면 null.
- distortion 은 발화에서 사고 패턴이 분명히 드러날 때만. 불분명하면 null.
- confidence 는 0.0~1.0 사이의 분류 확신도.`;

/** 모델 출력에서 JSON 객체를 관대하게 추출 — 코드펜스·앞뒤 잡음 허용 */
function extractJson(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 발화 → 시나리오 분류. 실패·불확실·잡담은 null (인테이크 모드 유지).
 * 호출부에서 타임아웃 레이스로 감싸고, 원본 프라미스는 늦게 와도 저장에 쓴다.
 */
export async function classifyUtterance(
  utterance: string,
  signal?: AbortSignal
): Promise<ScenarioClassification | null> {
  // 길면 앞을 버리고 끝을 남긴다 — 가장 최근 발화가 분류에 제일 중요하다
  const text = utterance.trim().slice(-MAX_INPUT_CHARS);
  if (!text) return null;

  try {
    const timeout = AbortSignal.timeout(CLASSIFY_HARD_TIMEOUT_MS);
    const raw = await completeOnce(
      [
        { role: "system", content: CLASSIFIER_SYSTEM },
        { role: "user", content: text },
      ],
      {
        model: process.env.COUNSEL_ROUTER_MODEL?.trim() || undefined,
        maxTokens: 200,
        json: true,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      }
    );

    const parsed = extractJson(raw);
    if (!parsed) return null;

    const subtheme = parsed.subtheme;
    if (typeof subtheme !== "string" || !isSubthemeCode(subtheme)) return null;

    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
    if (confidence < MIN_CONFIDENCE) return null;

    const distortion =
      typeof parsed.distortion === "string" && isDistortion(parsed.distortion)
        ? parsed.distortion
        : null;

    const scenario = findScenario(subtheme, distortion);
    return scenario ? { scenario, confidence } : null;
  } catch (e) {
    // 분류 실패는 상담을 막지 않는다 — 다음 턴에 자연 재시도
    console.error("[counsel/router] classify failed:", (e as Error)?.message ?? e);
    return null;
  }
}

/** 제한 시간 내 결과만 취하는 레이스 — 본 프라미스는 계속 진행된다 */
export function withinBudget<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}
