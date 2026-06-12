/**
 * 플레이북 렌더러 — 가이드라인 데이터를 시스템 프롬프트 섹션으로 압축한다.
 *
 * 구성(상황에 따라 선택적):
 * 1. 상담 플레이북 — 라우터가 고른 시나리오 1개의 단계별(A~F) 가이드
 * 2. 현재 단계 디렉티브 — 세션에 저장된 단계 + 단계 마커 프로토콜
 * 3. 인테이크 탐색 — 아직 시나리오가 특정되지 않았을 때(시트 03 인테이크 슬롯)
 * 4. 대화 복구(폴백) 규칙 — 모드별(텍스트=시트 06, 음성=시트 14) 선별 주입
 * 5. 안전 프로토콜 — 위험 신호 감지 시 최우선 지시
 *
 * 토큰 예산: 전체 합산 약 2~3k 토큰. 인프라 레벨 폴백(TTS 불가·네트워크 지연 등
 * 코드가 처리하는 항목)과 미출시 기능(EMA·패시브 센싱) 항목은 주입하지 않는다.
 */

import {
  ASSESSMENT_MAP,
  CALL_FALLBACKS,
  CBT_STAGES,
  DISTORTION_LABELS,
  TEXT_FALLBACKS,
  type CallScenario,
  type StageCode,
} from "./guidelines";
import { NEW_TOPIC_MARKER, stageMarker } from "@/lib/prompt";
import type { RiskLevel } from "./risk";

export type CounselMode = "text" | "call";

export interface GuidanceContext {
  mode: CounselMode;
  scenario: CallScenario | null;
  stage: StageCode | null;
  risk: RiskLevel;
  /** 지금-여기의 신체·감정 과부하 신호(호흡곤란·공황 등) — detectOverload */
  overload: boolean;
  /** 직전 assistant 답변들이 연속으로 질문으로 끝난 횟수 — 질문 강박 차단용 */
  questionStreak: number;
  /** 마지막 활동에서 오래(수 시간+) 지나 다시 찾아온 세션 — 체크인 우선 */
  revisit: boolean;
}

/** 이 횟수 이상 연속으로 질문으로 끝냈으면 이번 턴은 질문 없이 가게 한다 */
const QUESTION_STREAK_LIMIT = 3;

/** 시스템 프롬프트에 붙일 가이드라인 섹션들 — buildSystemPrompt 의 guidance 인자 */
export function buildGuidanceSections(ctx: GuidanceContext): string[] {
  const sections: string[] = [];
  if (ctx.scenario) {
    sections.push(renderScenarioPlaybook(ctx.scenario));
    sections.push(renderStageDirective(ctx.scenario, ctx.stage ?? "A"));
  } else {
    sections.push(renderIntakeDirective());
  }
  if (ctx.revisit) sections.push(renderRevisitDirective(!!ctx.scenario));
  sections.push(renderFallbackPlaybook(ctx.mode));
  if (ctx.questionStreak >= QUESTION_STREAK_LIMIT)
    sections.push(renderQuestionRestDirective(ctx.questionStreak));
  // 안정화·안전은 마지막 — 프롬프트 끝부분이 가장 높은 주의를 받는다.
  // 둘 다 감지되면 안전(자해·자살)이 안정화보다 뒤(최후미)에 온다.
  if (ctx.overload) sections.push(renderOverloadDirective(!!ctx.scenario));
  if (ctx.risk !== "none") sections.push(renderSafetyDirective(ctx.risk));
  return sections;
}

/**
 * 질문 휴식 — 모델의 자기 모니터링에만 맡기면 질문 강박(매 턴 질문으로 종결)이
 * 반복되므로, 서버가 연속 횟수를 세어 결정적으로 개입한다.
 */
function renderQuestionRestDirective(streak: number): string {
  return `[이번 턴 지시 — 질문 휴식]
당신의 최근 답변 ${streak}개가 연속으로 질문으로 끝났습니다. 실제 상담사는 이렇게 연달아 묻지 않습니다.
- 이번 답변은 질문 없이 마치세요. 들은 것을 정리해 주거나, 감정에 머물러 주거나, 짧은 타당화로 끝냅니다.
- 사용자가 침묵해도 괜찮다는 여백을 남기세요.
- 예외: 안전 확인이 필요한 상황에서는 이 지시보다 안전 확인 질문이 우선입니다.`;
}

// ── 1. 시나리오 플레이북 ────────────────────────────────────────────────────

const stageLabel = (code: StageCode) =>
  CBT_STAGES.find((s) => s.code === code)?.label_ko ?? code;

function renderScenarioPlaybook(s: CallScenario): string {
  const distortion = DISTORTION_LABELS[s.cognitive_distortion] ?? s.cognitive_distortion;
  return `[상담 플레이북 — ${s.chief_complaint_label} · ${s.subtheme_label}]
이번 상담은 아래 시나리오 가이드를 따라 A→B→C→D→E(→F) 단계로 진행합니다.
- 상담 목표: ${s.conversation_goal}
- 핵심 인지왜곡: ${distortion}
- 기준 장면: ${s.trigger_scene_detail}
- 예상 신체 신호: ${s.body_signal_detail}
- 예상 부적응 행동: ${s.maladaptive_behavior_detail}
- 감정 흐름: ${s.primary_emotion}(주) · ${s.secondary_emotion}(보조) → 목표: ${s.stage_f_expected_new_emotion}
- 주의 신호: ${s.distress_signal_hint}

[단계 가이드]
A. ${stageLabel("A")} — ${s.stage_a_antecedent}
   질문 예시: "${s.stage_a_counselor_example}"
   B로 전환: "${s.transition_a_to_b}"
B. ${stageLabel("B")} — 잡아야 할 자동사고: "${s.stage_b_belief}"
   질문 예시: "${s.stage_b_counselor_example}"
   C로 전환: "${s.transition_b_to_c}"
C. ${stageLabel("C")} — ${s.stage_c_consequence}
   질문 예시: "${s.stage_c_counselor_example}"
   D로 전환: "${s.transition_c_to_d}"
D. ${stageLabel("D")} — ${s.stage_d_disputation}
   질문 예시: "${s.stage_d_counselor_example}"
   도달점(내담자 재구성) 예시: "${s.stage_d_client_reframe}"
   E로 전환: "${s.transition_d_to_e}"
E. ${stageLabel("E")} — 미션: ${s.stage_e_mission} (${s.stage_e_frequency} · 강도 ${s.stage_e_intensity} · 1회 ${s.stage_e_duration})
   방법: ${s.stage_e_how} / 추적: ${s.stage_e_tracking_metric}
   합의 질문 예시: "${s.stage_e_agreement_prompt}"
F. ${stageLabel("F")} — 미션 합의를 한 문장으로 정리하고, 기대 감정(${s.stage_f_expected_new_emotion})의 방향으로 마음이 조금이라도 움직였는지 확인하며 마무리합니다.

[플레이북 사용 원칙]
- 예시 문장을 그대로 읽지 마세요. 사용자가 실제로 쓴 단어와 장면에 맞춰 자연스럽게 변형합니다.
- 플레이북은 가이드이지 대본이 아닙니다. 사용자가 꺼낸 실제 장면·주제가 시나리오와 다르면 사용자를 따라가세요.
- 한 단계가 충분히 표현되지 않았으면 다음 단계로 넘어가지 마세요. 질문은 한 번에 하나입니다.`;
}

// ── 2. 현재 단계 디렉티브 + 마커 프로토콜 ──────────────────────────────────

const STAGE_NOW: Record<StageCode, (s: CallScenario) => string> = {
  A: (s) =>
    `장면을 구체화하세요 — 언제·어디서·누구와 있었는지, 무슨 일이 있었는지. 기준 장면: ${s.stage_a_antecedent}`,
  B: (s) =>
    `그 장면에서 자동으로 스쳐간 생각·믿음을 한 문장으로 잡으세요. 예상 신념: "${s.stage_b_belief}"`,
  C: () =>
    `그 생각 이후의 감정·신체 반응·행동을 순서대로 연결해 보세요. 감정과 행동을 사용자의 말로 확인합니다.`,
  D: (s) =>
    `신념을 부드럽게 논박하세요 — 근거와 다른 가능성을 함께 찾습니다. 목표: ${s.stage_d_disputation}`,
  E: (s) =>
    `행동활성화 미션(${s.stage_e_mission})을 실행 가능한 수준으로 합의하세요. 어렵다고 하면 더 작게 줄입니다.`,
  F: (s) =>
    `미션 합의를 정리하고 감정 변화(목표: ${s.stage_f_expected_new_emotion})를 확인한 뒤 따뜻하게 마무리하세요.`,
};

/**
 * 단계별 전진 기준 — "충분히 표현됐는지"를 모델 임의 판단에 맡기지 않고
 * 관찰 가능한 완료 조건으로 명시한다. 기준 미달이면 같은 단계 유지.
 */
const STAGE_ADVANCE: Record<StageCode, string> = {
  A: "구체적 장면 하나(언제·어디서·누구와·무슨 일)가 잡혔으면 B로",
  B: "그 장면의 자동사고가 한 문장으로 진술됐으면 C로",
  C: "감정과 신체 반응·행동이 연결돼 확인됐으면 D로",
  D: "사용자가 대안적 관점을 자기 말로 한 번이라도 표현했으면 E로",
  E: "미션의 내용·주기·강도에 사용자가 동의했으면 F로",
  F: "합의 내용 요약과 감정 확인이 끝났으면 따뜻하게 마무리",
};

function renderStageDirective(s: CallScenario, stage: StageCode): string {
  return `[현재 단계: ${stage}(${stageLabel(stage)})]
- 지금 할 일: ${STAGE_NOW[stage](s)}
- 전진 기준: ${STAGE_ADVANCE[stage]}. 기준을 채우지 못했으면 같은 단계에 머무르세요.
- 답변 맨 끝에 "이 답변을 마친 시점의 단계" 마커를 정확히 하나 붙이세요(예: ${stageMarker(stage)}).
  · 한 번에 한 단계씩 전진이 원칙입니다. 단, 사용자가 이미 충분히 말한 내용을 다시 묻지는 마세요 — 짧게 인정하고 다음으로 넘어갑니다.
  · 사용자가 이전 단계의 이야기로 돌아가면(새 장면, 다른 생각 등) 마커도 그 단계로 되돌리세요.
- 사용자가 이 시나리오와 분명히 다른 새로운 고민으로 옮겨갔으면, 단계 마커 대신 ${NEW_TOPIC_MARKER} 를 답변 맨 끝에 붙이세요. 다음 턴부터 새 주제에 맞는 가이드로 전환됩니다. 잠깐 스친 얘기나 같은 문제의 다른 측면에는 붙이지 마세요.
- 마커는 사용자에게 보이지도 들리지도 않는 내부 신호입니다. 본문에서 "A단계", "다음 단계로" 같은 시스템 용어를 직접 말하지 마세요.`;
}

// ── 3. 인테이크 탐색 (시나리오 미특정) ──────────────────────────────────────

const INTAKE_SLOTS = ASSESSMENT_MAP.filter((i) => i.instrument === "Intake interview");

function renderIntakeDirective(): string {
  const slots = INTAKE_SLOTS.map((i) => `- ${i.item_summary}`).join("\n");
  return `[인테이크 탐색 — 주호소 미특정]
아직 이번 상담에서 다룰 주호소가 특정되지 않았습니다. 대화 초반에 아래 항목을 자연스럽게 파악하세요. 한 턴에 하나씩만 — 심문하듯 연달아 묻지 마세요.
${slots}
주호소가 분명해지면 가장 최근의 구체적인 장면 하나를 골라, 무슨 일이 있었는지(상황)부터 천천히 들어가세요.`;
}

// ── 3.5 재방문 체크인 ───────────────────────────────────────────────────────

/**
 * 마지막 활동에서 수 시간 이상 지난 세션 — 단계 기계를 그대로 이어가면
 * "어제의 단계 질문"부터 던지는 사고가 난다(예: E 단계였다면 다짜고짜 미션 합의).
 * 실제 상담의 재방문 프로토콜: 안부 → 미션 팔로업(행동활성화 추적) → 흐름 재개.
 */
function renderRevisitDirective(hasScenario: boolean): string {
  return `[다시 찾아온 사용자 — 체크인 우선]
마지막 대화에서 시간이 꽤 지나 사용자가 다시 찾아왔습니다. 지난 단계의 질문을 곧바로 이어가지 마세요.
- 첫 답변은 가벼운 안부에서 시작하세요. 그 사이 어떻게 지냈는지가 먼저입니다.
- 지난 대화에서 행동 미션을 합의했다면(위 기억과 대화 내용 참조) 해봤는지, 어땠는지 부담 없이 확인하세요. 실행하지 못했어도 절대 나무라지 말고, 미션을 더 작게 조정하는 쪽으로 움직입니다.
- 이전 주제를 이어가길 원하면 지난 흐름을 한 문장으로 상기시킨 뒤 천천히 재개하세요.${
    hasScenario
      ? `\n- 사용자가 새로운 고민을 꺼내면 단계 마커 대신 ${NEW_TOPIC_MARKER} 를 붙이세요.`
      : ""
  }`;
}

// ── 4. 대화 복구(폴백) 규칙 ─────────────────────────────────────────────────

/** next_route 코드 → 모델이 행동으로 옮길 수 있는 한국어 힌트 */
const ROUTE_HINTS: Record<string, string> = {
  retry_same_stage: "같은 단계에서 다시 시도",
  return_to_previous_question: "직전 질문으로 복귀",
  simplified_prompt: "더 쉬운 선택형 질문으로 전환",
  distress_regulate: "호흡·그라운딩으로 안정 후 복귀",
  "distress_regulate -> intake_explore": "안정 후 짧게 탐색 재개",
  schema_reframe: "신념 재구성으로 연결",
  move_to_next_stage: "핵심만 정리하고 다음 단계로",
  shrink_mission: "미션을 더 작게 축소",
  renegotiate_mission: "강도·시간을 낮춰 재합의",
  select_one_topic: "한 주제만 선택",
  risk_check: "안전 확인이 최우선",
  pause_or_continue: "쉬어갈지 선택권 제공",
  switch_to_english: "영어로 전환해 계속",
  switch_to_korean: "한국어로 전환해 계속",
  ba_plan: "작은 행동 계획으로 연결",
  intake_explore: "장면 탐색 계속",
  intake_explore_simplified: "선택형 질문으로 단순화",
  session_end: "부드럽게 마무리",
  ema_checkin: "오늘 상태를 짧게 점검",
  assessment_reminder: "짧은 자기점검 제안",
};

const routeHint = (route: string) => ROUTE_HINTS[route] ?? route;

/**
 * 모드 공통 대화 복구 원칙 — 실제 실패 사례에서 도출:
 * 같은 장면 질문을 4턴 반복하거나, 사용자가 말하지 않은 감정("불안하신 것 같은데")을
 * 단정해 투사하는 패턴을 막는다.
 */
const FALLBACK_COMMON_PRINCIPLES = `공통 원칙:
- 같은 취지의 질문이 두 번 막히면(짧은 답·회피·"모르겠다"·"막연하다") 같은 질문을 다시 변주하지 마세요. 선택형 질문으로 바꾸거나("화가 컸나요, 아니면 지치는 느낌이 컸나요?"), 장면 요구를 내려놓고 지금 이 순간의 감정·몸 상태에서 시작하세요.
- 사용자가 직접 표현하지 않은 감정을 단정하지 마세요. 감정 라벨은 사용자가 쓴 말을 빌려 반영하고, 추측이라면 단정("불안하신 것 같은데") 대신 확인 질문으로 건네세요.`;

/**
 * 텍스트 모드에 주입할 폴백 — 시트 06 중 모델이 대화로 대응 가능한 항목만.
 * 제외: 인프라(지연/STT/TTS/네트워크), 미출시 기능(EMA·패시브·검사지), 침묵(텍스트에선 관측 불가)
 */
const TEXT_FALLBACK_IDS = [
  "FB-AMB-01", "FB-AMB-02",
  "FB-OFF-01", "FB-OFF-02", "FB-OFF-03",
  "FB-DIS-01", "FB-DIS-02", "FB-DIS-03",
  "FB-RISK-01", "FB-RISK-02",
  "FB-SOL-01", "FB-BOUND-01", "FB-MULTI-01", "FB-RPT-01",
];

/**
 * 음성(깨비콜) 모드에 주입할 폴백 — 시트 14 중 모델 대응 가능 항목.
 * 제외: KCF-WAIT-01(지연 멘트)·KCF-ASR-01(인식 오류) — 클라이언트 워치독이 처리
 */
const CALL_FALLBACK_CODES = [
  "KCF-UNCLEAR-01", "KCF-SHORT-ANSWER-01",
  "KCF-OFFTOPIC-01", "KCF-OFFTOPIC-02",
  "KCF-SILENCE-01", "KCF-OVERLOAD-01", "KCF-BREATH-01",
  "KCF-GUILT-01", "KCF-SHAME-01",
  "KCF-I-DONT-KNOW-01", "KCF-RUMINATION-01",
  "KCF-RIGID-01", "KCF-HOPELESS-01",
  "KCF-AVOID-01", "KCF-MISSION-HARD-01", "KCF-ENERGY-LOW-01",
  "KCF-MULTI-TOPIC-01",
  "KCF-RISK-01", "KCF-RISK-02",
  "KCF-NO-TALK-01",
  "KCF-LANG-EN-01", "KCF-LANG-KO-01",
];

// 모듈 로드 시 1회 렌더 — 요청 경로에서는 문자열 결합만 일어난다
const TEXT_FALLBACK_SECTION = (() => {
  const byId = new Map(TEXT_FALLBACKS.map((f) => [f.fallback_id, f]));
  const lines = TEXT_FALLBACK_IDS.map((id) => byId.get(id))
    .filter((f) => !!f)
    .map(
      (f) =>
        `- ${f.trigger_condition}: ${f.response_strategy} → ${routeHint(f.next_route)}. 예: "${f.response_example}"`
    );
  return `[대화 복구 규칙 — 상황별 대응]
${FALLBACK_COMMON_PRINCIPLES}
대화가 아래 상황에 해당하면 그 대응 원칙을 따르세요. 예시는 어조 참고용이며 그대로 읽지 않습니다.
${lines.join("\n")}`;
})();

const CALL_FALLBACK_SECTION = (() => {
  const byCode = new Map(CALL_FALLBACKS.map((f) => [f.fallback_code, f]));
  const lines = CALL_FALLBACK_CODES.map((code) => byCode.get(code))
    .filter((f) => !!f)
    .map((f) => {
      const stagePart =
        f.apply_stage && f.apply_stage !== "전체" && f.apply_stage !== "global"
          ? ` (${f.apply_stage} 단계)`
          : "";
      return `- ${f.trigger_condition}${stagePart}: → ${routeHint(f.next_route)}. 예: "${f.counselor_response_example}"`;
    });
  return `[대화 복구 규칙 — 상황별 대응]
${FALLBACK_COMMON_PRINCIPLES}
통화가 아래 상황에 해당하면 그 대응 원칙을 따르세요. 예시는 어조 참고용이며 그대로 읽지 않습니다.
${lines.join("\n")}`;
})();

function renderFallbackPlaybook(mode: CounselMode): string {
  return mode === "call" ? CALL_FALLBACK_SECTION : TEXT_FALLBACK_SECTION;
}

// ── 5. 안정화 우선 (과부하) ─────────────────────────────────────────────────

/**
 * KCF-OVERLOAD-01 / FB-DIS-01 의 강제 적용판 — 폴백 목록 안의 한 줄로는
 * 단계 진행 지시에 묻힐 수 있어, 감지 시 별도 섹션으로 프롬프트 후미에 둔다.
 */
function renderOverloadDirective(hasScenario: boolean): string {
  return `[안정화 우선 — 지금 과부하 신호 감지]
방금 사용자 발화에 호흡곤란·공황·울먹임 등 지금 진행 중인 신체·감정 과부하 신호가 있습니다.
- 탐색·논박 등 모든 상담 질문을 멈추세요. 생각을 묻는 질문("어떤 생각이 들었나요?")은 지금 금지입니다.
- 이번 답변은 한두 문장으로 아주 짧게: 곁에 있음을 알리고, "천천히 세 번만 같이 숨을 쉬어볼까요" 같은 호흡·그라운딩을 먼저 제안합니다.
- 그 다음 턴에서 진정된 기색이 보이면, 계속할지 잠깐 쉬어갈지 선택권을 주세요. 계속 원할 때만 아주 천천히 재개합니다.${
    hasScenario ? `\n- 단계 마커는 현재 단계 그대로 붙이세요 — 전진하지 않습니다.` : ""
  }`;
}

// ── 6. 안전 프로토콜 ────────────────────────────────────────────────────────

function renderSafetyDirective(risk: RiskLevel): string {
  if (risk === "direct") {
    return `[안전 프로토콜 — 최우선]
방금 사용자 발화에서 직접적인 위험 신호(자해·자살·타해 관련 표현)가 감지되었습니다.
- 플레이북·단계 진행을 모두 멈추세요. 짧게 공감을 표현한 뒤 안전을 직접 확인합니다. 예: "지금 스스로를 다치게 할 계획이 있거나 바로 위험한 상황인가요?"
- 즉시 도움받을 수 있는 곳을 자연스럽게 안내하세요: 자살예방상담 109, 정신건강위기상담 1577-0199.
- 사용자가 안전하다고 확인되면 감정을 충분히 받아준 뒤, 서두르지 않고 원래 흐름으로 돌아갑니다.`;
  }
  return `[안전 확인 — 우선]
방금 사용자 발화에 의미가 모호한 위험 표현이 있습니다. 단정하지 말고, 짧고 부드럽게 안전 여부를 먼저 확인하세요. 예: "혹시 지금 안전이 위협받는 상황인지 제가 바로 확인해도 될까요?" 위험이 확인되면 자살예방상담 109, 정신건강위기상담 1577-0199 를 안내합니다.`;
}
