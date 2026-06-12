#!/usr/bin/env node
/**
 * 가이드라인 데이터 무결성 검증 — sync-guidelines.py 재실행 후 반드시 돌린다.
 *
 * 검사 항목:
 * - 시나리오 필수 필드 누락 / 단계 마커와 충돌할 대괄호 패턴
 * - 시나리오 → 폴백 코드 참조 무결성 (primary/secondary_fallback_code)
 * - 시나리오 → 주호소·서브테마·인지왜곡 카탈로그 정합성
 * - 서브테마×인지왜곡 조합 유일성 (라우터가 1:1 매핑을 전제)
 *
 * 사용법: node scripts/validate-guidelines.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "counsel", "guidelines", "data");
const load = (name) => JSON.parse(readFileSync(join(DATA, name), "utf8"));

const scenarios = load("scenarios.ko.json");
const subthemes = load("subthemes.json");
const callGuide = load("call-guide.json");
const fallbacks = load("fallbacks.json");

const DISTORTIONS = new Set([
  "catastrophizing", "labeling", "mind_reading", "should_statement",
  "all_or_nothing", "overgeneralization", "emotional_reasoning",
  "fortune_telling", "personalization", "perfectionism",
]);

const REQUIRED_FIELDS = [
  "scenario_id", "chief_complaint_code", "subtheme_code", "subtheme_label",
  "conversation_goal", "primary_emotion", "cognitive_distortion",
  "trigger_scene_detail", "stage_a_antecedent", "stage_a_counselor_example",
  "transition_a_to_b", "stage_b_belief", "stage_b_counselor_example",
  "transition_b_to_c", "stage_c_consequence", "stage_c_counselor_example",
  "transition_c_to_d", "stage_d_disputation", "stage_d_counselor_example",
  "stage_d_client_reframe", "transition_d_to_e", "stage_e_mission",
  "stage_e_frequency", "stage_e_intensity", "stage_e_duration", "stage_e_how",
  "stage_e_tracking_metric", "stage_e_agreement_prompt",
  "stage_f_expected_new_emotion", "primary_fallback_code", "secondary_fallback_code",
];

const errors = [];
const chiefCodes = new Set(callGuide.chief_complaints.map((c) => c.code));
const subthemeCodes = new Set(subthemes.map((s) => s.code));
const callFallbackCodes = new Set(fallbacks.call.map((f) => f.fallback_code));
const stageCodes = new Set(callGuide.stages.map((s) => s.code));

for (const code of ["A", "B", "C", "D", "E", "F"])
  if (!stageCodes.has(code)) errors.push(`call-guide 에 단계 ${code} 누락`);

const comboSeen = new Map();
for (const s of scenarios) {
  const id = s.scenario_id ?? "(id 없음)";
  for (const f of REQUIRED_FIELDS)
    if (!s[f]) errors.push(`${id}: 필수 필드 비어 있음 — ${f}`);
  if (!chiefCodes.has(s.chief_complaint_code))
    errors.push(`${id}: 미등록 주호소 코드 ${s.chief_complaint_code}`);
  if (!subthemeCodes.has(s.subtheme_code))
    errors.push(`${id}: 미등록 서브테마 코드 ${s.subtheme_code}`);
  if (!DISTORTIONS.has(s.cognitive_distortion))
    errors.push(`${id}: 미등록 인지왜곡 ${s.cognitive_distortion}`);
  for (const key of ["primary_fallback_code", "secondary_fallback_code"])
    if (s[key] && !callFallbackCodes.has(s[key]))
      errors.push(`${id}: 존재하지 않는 폴백 코드 ${s[key]} (${key})`);

  const combo = `${s.subtheme_code}|${s.cognitive_distortion}`;
  if (comboSeen.has(combo))
    errors.push(`서브테마×왜곡 중복: ${combo} — ${comboSeen.get(combo)} vs ${id}`);
  comboSeen.set(combo, id);

  // 제어 마커 규약([단계:X]·[새주제]·[통화종료])과 충돌하는 텍스트가 시트에서 흘러들지 않았는지
  for (const [k, v] of Object.entries(s))
    if (typeof v === "string" && /\[(단계:[A-F]|새주제|통화종료)\]/.test(v))
      errors.push(`${id}: 필드 ${k} 에 제어 마커 패턴 포함 — 마커 파싱과 충돌`);
}

if (errors.length) {
  console.error(`검증 실패 — ${errors.length}건:`);
  for (const e of errors.slice(0, 50)) console.error(`  · ${e}`);
  if (errors.length > 50) console.error(`  … 외 ${errors.length - 50}건`);
  process.exit(1);
}

console.log(
  `검증 통과 — 시나리오 ${scenarios.length}, 서브테마 ${subthemeCodes.size}, ` +
  `주호소 ${chiefCodes.size}, 콜 폴백 ${callFallbackCodes.size}, 텍스트 폴백 ${fallbacks.text.length}`
);
