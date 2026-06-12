/**
 * 위험 신호 결정적(deterministic) 감지 — LLM 판단과 독립적인 안전망.
 *
 * 가이드라인 시트의 위험 폴백(FB-RISK / KCF-RISK)은 "직접적 위험 언어"와
 * "모호한 위험 언어"를 구분한다. LLM 도 프롬프트로 같은 지시를 받지만,
 * 모델·라우팅 장애와 무관하게 동작하는 코드 레이어를 한 겹 더 둔다.
 * 여기서 감지되면 해당 턴의 시스템 프롬프트에 안전 프로토콜이 강제 주입된다.
 *
 * 원칙: 미탐(false negative)이 오탐(false positive)보다 훨씬 위험하다.
 * 오탐의 비용은 "안전을 한 번 더 확인하는 질문" 정도이므로 패턴은 넓게 잡는다.
 */

export type RiskLevel = "none" | "ambiguous" | "direct";

/** 직접적 위험 표현 — 자해·자살·타해 의도가 명시적으로 드러나는 패턴 */
const DIRECT_PATTERNS: RegExp[] = [
  /자살/,
  /자해/,
  /죽\s*고\s*싶/,
  /죽\s*어\s*버리/,
  /죽\s*을\s*래/,
  /죽\s*어야\s*(겠|할)/,
  /목\s*(을\s*)?매/,
  /유서/,
  /번개탄/,
  /투신/,
  /손목\s*(을\s*)?(긋|그어)/,
  /약\s*(을\s*)?(털어|모아|왕창)/,
  /죽\s*여\s*버리/, // 타해
  /죽\s*이\s*고\s*싶/, // 타해
  /해\s*치\s*고\s*싶/, // 타해
];

/** 모호한 위험 표현 — 의미 확인이 필요한 패턴 */
const AMBIGUOUS_PATTERNS: RegExp[] = [
  /사라지\s*고\s*싶/,
  /사라졌\s*으면/,
  /없어지\s*고\s*싶/,
  /없어졌\s*으면/,
  /살\s*기\s*싫/,
  /살\s*고\s*싶지\s*않/,
  /다\s*끝내\s*(고\s*싶|버리)/,
  /끝내\s*고\s*싶/,
  /더\s*는\s*못\s*버티/,
  /버틸\s*수\s*가?\s*없/,
  /살아\s*있\s*(는\s*게|을\s*이유)/,
  /삶\s*의?\s*의미\s*가?\s*없/,
  /의미\s*가?\s*없\s*(어|다|는)/,
  /포기하\s*고\s*싶/,
];

export function detectRisk(text: string | undefined | null): RiskLevel {
  if (!text) return "none";
  for (const p of DIRECT_PATTERNS) if (p.test(text)) return "direct";
  for (const p of AMBIGUOUS_PATTERNS) if (p.test(text)) return "ambiguous";
  return "none";
}

/**
 * 신체·감정 과부하 감지 — "지금" 일어나고 있는 호흡곤란·공황·울먹임 신호.
 * 가이드라인의 감정 과부하 폴백(KCF-OVERLOAD-01 / FB-DIS-01: 질문 중지 후
 * 호흡·그라운딩)이 LLM 판단에만 의존하면 단계 진행 지시에 묻혀 무시될 수 있어
 * (실제 발생 사례: "숨쉬기 힘들다"에 인지 탐색 질문을 계속함) 코드로 한 겹 더 감지한다.
 *
 * 주의: C 단계에서 "그때 가슴이 조여왔어요"처럼 과거 장면의 신체 반응을 *묘사*하는
 * 것은 정상적인 상담 내용이다 — 과거형 어미(았/었/였)가 붙은 표현은 제외한다.
 */
const OVERLOAD_PATTERNS: RegExp[] = [
  /숨\s*쉬기\s*(가|도|너무)?\s*힘들(?!었)/,
  /숨(이|을)?\s*(안\s*쉬어|못\s*쉬)/,
  /숨이?\s*막(혀|히)(?!었)/,
  /숨이?\s*차(요|서|다|단)?(?!분)/,
  /숨이?\s*가(빠|쁘)(?!졌|빴)/,
  /과호흡/,
  /공황/,
  /심장이\s*(터질|너무\s*뛰|쿵쾅)(?!었)/,
  /토할\s*것\s*같(?!았)/,
  /어지러(워|움)(?!웠)/,
  /손이?\s*떨(려|림)(?!렸)/,
  /(울음|눈물)이?\s*(멈추지|안\s*멈춰|계속\s*나)/,
  /말이\s*안\s*나와/,
];

/** 지금-여기의 과부하 신호가 보이면 true — 안정화 우선 디렉티브가 주입된다 */
export function detectOverload(text: string | undefined | null): boolean {
  if (!text) return false;
  return OVERLOAD_PATTERNS.some((p) => p.test(text));
}
