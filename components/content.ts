export const EMAIL = "symple.help@gmail.com";
export const CONTACT_HREF = `mailto:${EMAIL}?subject=${encodeURIComponent("SYMPLE 팀 문의")}`;

export const brand = {
  name: "SYMPLE",
  descriptor: "데이터 기반 멘탈헬스테크 기업",
  tagline:
    "음성·행동·대화 데이터에서 정서 변화의 초기 신호를 포착해, 맞춤형 개입으로 잇습니다.",
  email: EMAIL,
};

export type ProductId = "kkebi" | "ducks" | "team";

export const tabs: { id: ProductId; label: string; sub: string }[] = [
  { id: "kkebi", label: "KKEBI", sub: "Voice Mental Care" },
  { id: "ducks", label: "오리의 꿈", sub: "Duck's Dream" },
  { id: "team", label: "팀 소개", sub: "About SYMPLE" },
];

export const accents: Record<ProductId, { accent: string; strong: string; soft: string }> = {
  kkebi: { accent: "#FA5454", strong: "#E63B3B", soft: "#FFECEC" },
  ducks: { accent: "#6F9A57", strong: "#5C8348", soft: "#EEF4E8" },
  team: { accent: "#00BF7F", strong: "#00A86E", soft: "#E9F9F1" },
};

/* ───────────────────────────────────────────────────────── KKEBI */

export const kkebi = {
  hero: {
    eyebrow: "KKEBI · Voice Mental Care",
    titleA: "직원은 괜찮다고 말합니다.\n",
    titleAccent: "목소리",
    titleB: "는 번아웃을 말합니다.",
    desc: "하루 10분, 설문이 놓치던 스트레스·번아웃 신호를 목소리·행동·대화의 변화에서 먼저 잡아냅니다. 리포트와 실천 미션, 상담 연결까지 한 흐름으로 잇습니다.",
    primary: { text: "KKEBI 체험하기", href: "#" },
    secondary: { text: "기업 도입 문의", href: CONTACT_HREF },
    image: "/images/kkebi-hero.png",
    chips: ["음성 분석 완료", "번아웃 위험도 · 주의", "미션 진행도 75%"],
    note: "지금 파일럿 참여 기관을 모집하고 있어요.",
  },
  trust: {
    label: "이미 함께하고 있는 곳들",
    logos: ["아산나눔재단", "연세대학교", "정신건강복지센터", "보건복지부", "하나금융"],
  },
  problem: {
    eyebrow: "숫자로 보는 문제",
    title: "직장인의 마음건강 문제는 ",
    titleAccent: "조직 손실",
    titleAfter: "로 이어집니다.",
    stats: [
      { num: "51", suffix: "%", label: "직장인 번아웃 경험률", source: "Grant Thornton, 2024" },
      { num: "1", suffix: "조 달러", label: "우울·불안으로 인한 연간 생산성 손실", source: "WHO" },
      { num: "149", suffix: "시간", label: "OECD 평균 대비 연간 초과 근로", source: "OECD" },
      { num: "9", suffix: "%", label: "근로자 복지 서비스 실제 이용률", source: "Industry reports" },
    ],
    pains: [
      {
        no: "01",
        title: "늦은 자각",
        body: '많은 직장인은 상태가 악화된 뒤에야 "생각보다 많이 지쳐 있었구나"를 알아차립니다.',
        stat: "번아웃 이후",
        statLabel: "상태를 인지하는 시점",
      },
      {
        no: "02",
        title: "높은 접근 장벽",
        body: "상담이나 지원 제도는 있어도 예약, 시간, 낙인 부담 때문에 실제 이용은 낮습니다.",
        stat: "9%",
        statLabel: "근로자 복지 서비스 실제 이용률",
      },
      {
        no: "03",
        title: "끊긴 관리 흐름",
        body: "설문은 설문대로, 상담은 상담대로, 실천은 또 따로. 지속적으로 관리하기 어렵습니다.",
        stat: "3곳",
        statLabel: "분산된 관리 접점",
      },
    ],
    definition: {
      eyebrow: "문제 정의",
      a: "문제는 스트레스 자체보다\n",
      accent: "너무 늦게 알아차린다는 점",
      b: "입니다.",
    },
  },
  diff: {
    eyebrow: "왜 다른가",
    title: "KKEBI는 접근부터 ",
    titleAccent: "다릅니다",
    titleAfter: ".",
    desc: "기존 솔루션이 놓친 지점을 정확히 짚습니다.",
    items: [
      {
        kicker: "말이 아니라 신호를 봅니다",
        title: "스스로 모르는 변화까지 먼저 잡아냅니다",
        body: "텍스트 상담과 설문은 사용자의 자각에만 기댑니다. KKEBI는 목소리와 행동에서 스스로 인지하지 못한 변화까지 먼저 포착합니다.",
        before: "자가 보고에 의존",
        after: "객관적 신호 분석",
        image: "/images/kkebi-voice-care.png",
      },
      {
        kicker: "발견부터 실천까지 돕습니다",
        title: "발견 → 분석 → 개입까지 하나의 흐름",
        body: "상태 확인에 그치지 않고, 분석 결과에 맞춰 미션을 제안하고 필요하면 후속 상담까지 연결합니다.",
        before: "측정만 하고 끝",
        after: "실천까지 연결",
        image: "/images/kkebi-personal-mission.png",
      },
      {
        kicker: "조직까지 함께 봅니다",
        title: "개인 → 상담사 → HR 까지 연결",
        body: "개인만 관리해서는 해결되지 않는 문제가 있습니다. KKEBI는 개인, 상담사, 기업 HR을 연결해 실제 상담 지원과 조직 차원 대응까지 돕습니다.",
        before: "개인에게만 책임",
        after: "조직 전체 대응",
        image: "/images/kkebi-baseline-check.png",
      },
    ],
  },
  flow: {
    eyebrow: "어떻게 작동하나",
    title: "마음 건강, ",
    titleAccent: "딱 네 단계",
    titleAfter: "면 됩니다.",
    desc: "검사부터 실천 미션까지, 막히는 단계 없이 이어집니다.",
    steps: [
      { no: "01", title: "지금 상태부터 확인", body: "짧은 검사와 목소리 확인으로 지금 내 상태와 평소 기준을 먼저 파악합니다." },
      { no: "02", title: "목소리로 마음 변화 읽기", body: "5–10분 대화 속 음성, 말의 흐름, 행동 신호에서 스트레스와 번아웃 위험을 살핍니다." },
      { no: "03", title: "변화를 한눈에", body: "내 상태가 어떻게 달라지고 있는지 이해하기 쉬운 리포트로 보여줍니다." },
      { no: "04", title: "바로 해볼 수 있는 미션", body: 'CBT 기반 맞춤 미션으로 "알았다"에서 끝나지 않고 "해봤다"로 이어지게 합니다.' },
    ],
  },
  characters: {
    eyebrow: "KKEBI 캐릭터",
    title: "무거운 마음도, 가볍게 마주하도록.",
    desc: "체크인 결과가 너무 무겁지 않도록, 깨비 캐릭터가 곁에 있습니다.",
    items: [
      { name: "플라워깨비", desc: "따뜻하고 부드러운 성격으로, 감정을 자연스럽게 표현하도록 도와줍니다.", video: "/characters/FLOWERMON.webm" },
      { name: "아이스깨비", desc: "차분하고 이성적인 접근으로 스트레스를 분석합니다.", video: "/characters/ICEMON.webm" },
      { name: "파이어깨비", desc: "열정적이고 에너지 넘치는 미션으로 동기를 부여합니다.", video: "/characters/Firemon.webm" },
      { name: "엔젤깨비", desc: "평화롭고 안정적인 분위기로 마음을 진정시킵니다.", video: "/characters/ANGELMON.webm" },
      { name: "매직깨비", desc: "창의적이고 신비로운 방식으로 새로운 관점을 제시합니다.", video: "/characters/MAGICMON.webm" },
    ],
  },
  audience: {
    eyebrow: "누구에게 좋은가",
    title: "개인도, 상담사도, 조직도, ",
    titleAccent: "각자에게 필요한 것",
    titleAfter: "을 줍니다.",
    items: [
      {
        tag: "직원",
        title: "지금 내 상태를 더 빨리 알 수 있게",
        sub: "스스로 미처 몰랐던 변화를 먼저 알려드려요",
        points: ["목소리 기반 마음 상태 확인", "맞춤 행동 미션 제안", "필요 시 전문가 연결"],
      },
      {
        tag: "상담사",
        title: "상담 사이 변화를 더 잘 볼 수 있게",
        sub: "세션 사이의 공백을 데이터로 채워드려요",
        points: ["사전 상태 파악", "AI 요약 및 기록 보조", "위험 신호 조기 확인"],
      },
      {
        tag: "조직",
        title: "보이지 않던 리스크를 더 먼저 보게",
        sub: "조직 전체의 마음건강 현황을 한눈에",
        points: ["팀 단위 익명 리포트", "개입 우선순위 설정", "복지 효과 가시성 확보"],
      },
    ],
  },
  security: {
    eyebrow: "보안 · 신뢰",
    title: "민감한 데이터일수록 ",
    titleAccent: "더 안전하게",
    titleAfter: " 다뤄야 합니다.",
    items: [
      { title: "이름 없이 저장", body: "음성·대화 데이터는 개인을 특정할 수 없는 형태로 저장됩니다." },
      { title: "정해진 사람만 열람", body: "상담사·조직 담당자는 권한 범위 안에서만 볼 수 있습니다." },
      { title: "보안 표준, 차근차근", body: "국내·국제 보안 표준에 맞춰 보호 구조를 단계적으로 갖추고 있습니다." },
      { title: "파일럿으로 검증", body: "실제 환경에서 안전하게 작동하는지, 파일럿으로 함께 점검합니다." },
    ],
  },
  cta: {
    eyebrow: "파일럿 모집 중",
    title: "우리 조직에서 먼저 시작해보세요.",
    desc: "상담센터, 기업 HR, 파트너 기관과 시범 도입을 막 시작하고 있어요.",
    primary: { text: "KKEBI 체험하기", href: "#" },
    secondary: { text: "기업 도입 문의", href: CONTACT_HREF },
  },
};

/* ──────────────────────────────────────────────────── 오리의 꿈 */

export const ducks = {
  hero: {
    eyebrow: "오리의 꿈 · Duck's Dream",
    titleA: "꾸준함은 저희가 만들게요.\n마음만 ",
    titleAccent: "가볍게",
    titleB: " 들고 오세요.",
    desc: "오리의 꿈은 캐릭터, 미션, 챗봇 상담, 기록을 하나의 흐름으로 잇는 게임형 멘탈케어 앱입니다. 부담 없이 자주 돌아오고, 작은 회복을 매일 이어갑니다.",
    primary: { text: "앱 체험하기", href: "#" },
    secondary: { text: "앱 둘러보기", href: "#experience" },
    image: "/images/ducks-persona-select.png",
  },
  stats: [
    { value: "12+", label: "수집 캐릭터" },
    { value: "85%", label: "미션 완수율" },
    { value: "3.2x", label: "재방문률" },
  ],
  why: {
    eyebrow: "왜 계속하게 될까",
    titleA: "억지로 참는 앱이 아니라,\n",
    titleAccent: "달라져서 다시 열게 되는",
    titleB: " 앱.",
    desc: "기분을 기록하는 데서 끝나지 않고, 회복이 이어지게 만듭니다.",
    items: [
      {
        title: "자랄수록 손이 가는 캐릭터",
        body: "계속하고 싶게 만드는 성장 구조. 미션과 루틴을 이어갈수록 캐릭터가 자라고 보상이 쌓입니다.",
        metric: "희귀 캐릭터 수집",
        image: "/images/ducks-ranking.png",
      },
      {
        title: "기록에서 행동으로",
        body: "기록에서 끝나지 않고 행동으로 이어지게. CBT 기반 챗봇과 행동 미션이 감정을 적는 데서 멈추지 않고 작은 실천과 변화로 자연스럽게 옮겨 줍니다.",
        metric: "감정 기록 → 행동 변화",
        image: "/images/ducks-chat.png",
      },
      {
        title: "끊기지 않는 회복 흐름",
        body: "플레이하는 동안 회복이 계속됩니다. 미니게임, 감정 리포트, 루틴 기록, 보상이 하나로 이어집니다.",
        metric: "지속 가능한 회복 루프",
        image: "/images/ducks-mindcheck.png",
      },
    ],
  },
  experience: {
    eyebrow: "앱 경험",
    titleA: "캐릭터, 미션, 상담, 보상이\n",
    titleAccent: "한 흐름",
    titleB: "으로 이어집니다.",
    desc: "버튼을 눌러 오리의 꿈의 전체 흐름을 살펴보세요.",
    items: [
      { tag: "캐릭터 선택", title: "나와 맞는 오리 페르소나 선택", body: "지금 내 상태와 잘 맞는 오리를 고르면 앱을 한결 편안하고 친근하게 시작할 수 있습니다.", image: "/images/ducks-persona-select.png" },
      { tag: "챗봇 상담", title: "부담 없이 감정을 풀어내는 대화", body: "무겁지 않은 챗봇 상담으로 혼자 삼키던 감정을 가볍게 꺼내볼 수 있습니다.", image: "/images/ducks-chat.png" },
      { tag: "플레이 미션", title: "작은 실천으로 이어지는 플레이 미션", body: "미니게임과 행동 미션으로 감정 인식이 실제 루틴과 행동 변화로 이어집니다.", image: "/images/ducks-game.png" },
      { tag: "보상 구조", title: "다시 돌아오게 만드는 보상 구조", body: "성장, 수집, 달성의 재미를 더해 마음관리의 반복 경험이 지루하지 않게 이어집니다.", image: "/images/ducks-ranking.png" },
      { tag: "마음 체크", title: "회복 흐름을 확인하는 마음 체크", body: "기록과 플레이 결과로 내 기분과 변화 흐름을 자연스럽게 돌아볼 수 있습니다.", image: "/images/ducks-mindcheck.png" },
    ],
  },
  testimonials: {
    eyebrow: "사용자 후기",
    titleA: "실제로 다시 돌아오게 만드는 건\n",
    titleAccent: "부담 없는 반복 경험",
    titleB: "입니다.",
    items: [
      { quote: "마음이 힘들 때 앱을 여는 것조차 귀찮았는데, 오리 캐릭터 때문에 자연스럽게 다시 들어가게 됐어요.", name: "연두콩", role: "직장인" },
      { quote: "미션이 너무 무겁지 않아서 좋았습니다. CBT를 이렇게 가볍게 시작할 수 있다는 게 의외였어요.", name: "몽글", role: "대학생" },
      { quote: "챗봇 상담에서 감정을 먼저 정리하고 나니 실제 상담도 훨씬 수월해졌어요.", name: "루미", role: "초기 파일럿 참여자" },
      { quote: "게임 보상 구조가 과하지 않고, 회복 루틴을 계속 이어가게 만드는 정도로 잘 설계되어 있습니다.", name: "햇살메이트", role: "멘탈헬스 파트너" },
    ],
  },
  cta: {
    eyebrow: "지금 바로 체험",
    titleA: "직접 써보면,\n",
    titleAccent: "왜 다시 돌아오게 되는지",
    titleB: " 알 수 있습니다.",
    desc: "캐릭터, 미션, 상담, 보상이 하나로 이어지는 흐름, 직접 느껴보세요.",
    primary: { text: "앱 체험하기", href: "#" },
    secondary: { text: "앱 둘러보기", href: "#experience" },
  },
};

/* ───────────────────────────────────────────────────────── 팀 / 회사 */

export const team = {
  hero: {
    eyebrow: "팀 소개",
    titleA: "마음 건강을, 늦기 전에.\n",
    titleAccent: "데이터로",
    titleB: " 더 정확하게.",
    desc: "마음의 변화를 읽고, 바로 돕고, 다음 단계로 잇습니다. 읽는 데서 멈추지 않는 멘탈헬스테크 팀, SYMPLE입니다.",
    primary: { text: "팀과 이야기하기", href: CONTACT_HREF },
  },
  why: {
    eyebrow: "왜 SYMPLE인가",
    titleA: "마음 문제는 대부분,\n",
    titleAccent: "너무 늦게",
    titleB: " 발견됩니다.",
  },
  stats: [
    { num: "50", suffix: "+", label: "도입·연구 협력 기관" },
    { num: "12", suffix: "만", label: "누적 사용자" },
    { num: "4", suffix: "", label: "임상·연구 파트너" },
    { num: "73", suffix: "%", label: "지원이 부족하다는 직원" },
  ],
  pillars: {
    eyebrow: "우리가 만드는 것",
    titleA: "측정에서 끝나지 않습니다.\n개입하고, ",
    titleAccent: "연결까지",
    titleB: " 합니다.",
    items: [
      { step: "측정", body: "음성·행동·대화에서 마음의 변화를 숫자로 읽습니다." },
      { step: "개입", body: "CBT 기반 미션과 게임으로, 그 신호를 실제 행동으로 옮깁니다." },
      { step: "연결", body: "결과를 사용자·상담사·조직 각자의 언어로 풀어, 다음 단계로 잇습니다." },
    ],
  },
  evidence: {
    eyebrow: "근거와 검증",
    titleA: "느낌이 아니라,\n",
    titleAccent: "데이터로 확인",
    titleB: "합니다.",
    items: [
      { title: "임상 근거", body: "음성 디지털 바이오마커는 우울·불안 척도와 유의미한 상관을 보입니다.", metric: "상관계수 r=0.78", progress: 78 },
      { title: "연구 파트너", body: "아산나눔재단·연세대 등 주요 기관과 임상·운영 데이터를 함께 검증합니다.", metric: "4개 기관 검증 완료", progress: 100 },
      { title: "필드 검증", body: "직장·학교·의료 현장에서 직접 돌려보며 데이터를 쌓고 있습니다.", metric: "50+ 현장 파일럿", progress: 65 },
      { title: "확장성", body: "대학·병원·공공기관·민간 파트너와 연구·현장을 함께 넓혀가고 있습니다.", metric: "3개국 확장 진행", progress: 45 },
    ],
  },
  resources: {
    eyebrow: "리소스 · 인사이트",
    titleA: "데이터가 들려주는\n",
    titleAccent: "마음 건강 이야기.",
    items: [
      { title: "음성으로 마음을 읽다", sub: "KKEBI의 디지털 바이오마커 접근" },
      { title: "게임이 케어가 될 때", sub: "Duck's Dream의 회복 루프 설계" },
      { title: "데이터로 운영하는 웰니스", sub: "HR이 추측 없이 판단하려면" },
    ],
  },
  cta: {
    eyebrow: "함께 일하기",
    titleA: "멘탈헬스의 기준,\n",
    titleAccent: "함께 만들 사람",
    titleB: "을 찾습니다.",
    desc: "연구 협력, 파일럿 도입, 콘텐츠·브랜드 협업, 조직 웰니스까지 — 함께할 팀과 파트너라면 언제든 환영합니다.",
    primary: { text: "이야기 시작하기", href: CONTACT_HREF },
    secondary: { text: "파트너십 문의", href: CONTACT_HREF },
  },
};

export const footer = {
  tagline: brand.tagline,
  columns: [
    {
      title: "제품",
      links: [
        { label: "KKEBI", tab: "kkebi" as ProductId },
        { label: "오리의 꿈", tab: "ducks" as ProductId },
      ],
    },
    {
      title: "회사",
      links: [
        { label: "팀 소개", tab: "team" as ProductId },
        { label: "문의", href: CONTACT_HREF },
      ],
    },
  ],
  legal: ["개인정보처리방침", "이용약관"],
};
