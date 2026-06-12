/**
 * KKEBI 상담 가이드라인 데이터 액세스 레이어.
 *
 * 단일 진실 공급원은 운영 스프레드시트이고, scripts/sync-guidelines.py 가
 * 그것을 data/*.json 으로 변환한다. 런타임 코드는 이 모듈을 통해서만 접근한다.
 *
 * 규모: 시나리오 500개(주호소 10 × 서브테마 5 × 인지왜곡 10)는 프롬프트에
 * 전부 넣을 수 없다 → 라우터(router.ts)가 발화를 분류해 시나리오 1개를 고르고,
 * 플레이북(playbook.ts)이 그 시나리오만 압축해 시스템 프롬프트에 주입한다.
 */

import scenariosJson from "./guidelines/data/scenarios.ko.json";
import subthemesJson from "./guidelines/data/subthemes.json";
import callGuideJson from "./guidelines/data/call-guide.json";
import fallbacksJson from "./guidelines/data/fallbacks.json";
import assessmentJson from "./guidelines/data/assessment-map.json";

export type StageCode = "A" | "B" | "C" | "D" | "E" | "F";

export const DISTORTIONS = [
  "catastrophizing",
  "labeling",
  "mind_reading",
  "should_statement",
  "all_or_nothing",
  "overgeneralization",
  "emotional_reasoning",
  "fortune_telling",
  "personalization",
  "perfectionism",
] as const;
export type DistortionCode = (typeof DISTORTIONS)[number];

/** 인지왜곡 한국어 라벨 — 분류기 카탈로그와 플레이북 표기에 사용 */
export const DISTORTION_LABELS: Record<DistortionCode, string> = {
  catastrophizing: "파국화",
  labeling: "낙인찍기",
  mind_reading: "독심술(상대 마음 단정)",
  should_statement: "당위적 사고(반드시·해야만)",
  all_or_nothing: "흑백논리",
  overgeneralization: "과잉일반화",
  emotional_reasoning: "감정적 추론",
  fortune_telling: "예언(부정적 미래 단정)",
  personalization: "개인화(과도한 자기 귀인)",
  perfectionism: "완벽주의",
};

export interface CallScenario {
  scenario_id: string;
  scenario_cluster: string;
  chief_complaint_code: string;
  chief_complaint_label: string;
  subtheme_code: string;
  subtheme_label: string;
  language: string;
  conversation_goal: string;
  primary_emotion: string;
  secondary_emotion: string;
  cognitive_distortion: DistortionCode;
  distress_signal_hint: string;
  trigger_scene_detail: string;
  body_signal_detail: string;
  maladaptive_behavior_detail: string;
  estimated_total_minutes: number | string;
  stage_a_minutes: number | string;
  stage_b_minutes: number | string;
  stage_c_minutes: number | string;
  stage_d_minutes: number | string;
  stage_e_minutes: number | string;
  client_opening: string;
  counselor_opening: string;
  stage_a_antecedent: string;
  stage_a_counselor_example: string;
  stage_a_client_example: string;
  transition_a_to_b: string;
  stage_b_belief: string;
  stage_b_counselor_example: string;
  stage_b_client_example: string;
  transition_b_to_c: string;
  stage_c_consequence: string;
  stage_c_counselor_example: string;
  stage_c_client_example: string;
  transition_c_to_d: string;
  stage_d_disputation: string;
  stage_d_counselor_example: string;
  stage_d_client_reframe: string;
  transition_d_to_e: string;
  stage_e_mission: string;
  stage_e_frequency: string;
  stage_e_intensity: string;
  stage_e_duration: string;
  stage_e_how: string;
  stage_e_tracking_metric: string;
  stage_e_sensor_proxy: string;
  stage_e_agreement_prompt: string;
  stage_e_client_agreement: string;
  stage_f_expected_new_emotion: string;
  primary_fallback_code: string;
  secondary_fallback_code: string;
}

export interface Subtheme {
  chief_complaint_code: string;
  code: string;
  label_ko: string;
}

export interface ChiefComplaint {
  code: string;
  label_ko: string;
  label_en: string;
  emoji: string | null;
}

export interface CbtStage {
  code: StageCode;
  label_ko: string;
  label_en: string;
  note: string | null;
}

/** 06_ScenarioLibrary_Fallback — 텍스트 상담용 */
export interface TextFallback {
  fallback_id: string;
  fallback_type: string;
  trigger_condition: string;
  response_strategy: string;
  response_example: string;
  next_route: string;
}

/** 14_KkebiCallFallbacks — 깨비콜(음성)용 */
export interface CallFallback {
  fallback_code: string;
  language: string;
  fallback_group: string;
  apply_stage: string;
  trigger_condition: string;
  user_utterance_example: string;
  counselor_goal: string;
  counselor_response_example: string;
  next_route: string;
  note: string;
}

/** 03_AssessmentMap — 검사 도구·인테이크 슬롯 */
export interface AssessmentItem {
  instrument: string;
  item_code: string;
  item_summary: string;
  response_scale: string;
  scoring_rule: string;
  cut_point_or_flag: string;
  follow_up_action: string;
  cadence: string;
}

const scenarios = scenariosJson as unknown as CallScenario[];
export const SUBTHEMES = subthemesJson as Subtheme[];
export const CHIEF_COMPLAINTS = callGuideJson.chief_complaints as ChiefComplaint[];
export const CBT_STAGES = callGuideJson.stages as CbtStage[];
export const TEXT_FALLBACKS = (fallbacksJson as { text: TextFallback[] }).text;
export const CALL_FALLBACKS = (fallbacksJson as unknown as { call: CallFallback[] }).call;
export const ASSESSMENT_MAP = assessmentJson as AssessmentItem[];

export const STAGE_CODES: StageCode[] = ["A", "B", "C", "D", "E", "F"];
export const isStageCode = (s: string): s is StageCode =>
  (STAGE_CODES as string[]).includes(s);
export const isDistortion = (s: string): s is DistortionCode =>
  (DISTORTIONS as readonly string[]).includes(s);

// ── 인덱스 — 모듈 로드 시 1회 구성 ─────────────────────────────────────────
const byId = new Map<string, CallScenario>();
const bySubthemeDistortion = new Map<string, CallScenario>();
const bySubtheme = new Map<string, CallScenario[]>();
for (const s of scenarios) {
  byId.set(s.scenario_id, s);
  bySubthemeDistortion.set(`${s.subtheme_code}|${s.cognitive_distortion}`, s);
  const list = bySubtheme.get(s.subtheme_code);
  if (list) list.push(s);
  else bySubtheme.set(s.subtheme_code, [s]);
}

export const getScenarioById = (id: string) => byId.get(id) ?? null;

/**
 * 서브테마 + 인지왜곡 → 시나리오. 시트 구조상 조합이 1:1 이지만,
 * 분류기가 왜곡을 못 정했거나 조합이 비면 해당 서브테마의 첫 변형으로 폴백한다
 * (장면·미션은 서브테마가 결정하므로 왜곡이 달라도 플레이북 가치가 유지된다).
 */
export function findScenario(
  subthemeCode: string,
  distortion?: string | null
): CallScenario | null {
  if (distortion) {
    const exact = bySubthemeDistortion.get(`${subthemeCode}|${distortion}`);
    if (exact) return exact;
  }
  return bySubtheme.get(subthemeCode)?.[0] ?? null;
}

export const isSubthemeCode = (s: string) => bySubtheme.has(s);
