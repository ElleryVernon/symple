export interface CachedCounselSession {
  externalId: string;
  userId: string;
  /** 분류된 시나리오 ID — 미분류면 null */
  scenarioId: string | null;
  /** 현재 CBT 단계(A~F) — 시나리오 없으면 null */
  stage: string | null;
  /** 마지막 턴 시각(ms) — 재방문(체크인) 판정용. DB 의 Session.updatedAt 에 대응 */
  lastTurnAt: number;
}

const MAX_CACHED_SESSIONS = 500;
const globalForCounsel = globalThis as unknown as {
  counselSessions?: Map<string, CachedCounselSession>;
};

const sessions = globalForCounsel.counselSessions ?? new Map<string, CachedCounselSession>();

if (process.env.NODE_ENV !== "production") globalForCounsel.counselSessions = sessions;

export function getCachedCounselSession(sessionId: string, externalId: string) {
  const cached = sessions.get(sessionId);
  return cached?.externalId === externalId ? cached : null;
}

export function cacheCounselSession(
  sessionId: string,
  externalId: string,
  userId: string,
  scenarioId: string | null = null,
  stage: string | null = null,
  lastTurnAt: number = Date.now()
) {
  sessions.delete(sessionId);
  sessions.set(sessionId, { externalId, userId, scenarioId, stage, lastTurnAt });

  if (sessions.size > MAX_CACHED_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest) sessions.delete(oldest);
  }
}

/** 분류·단계 진행을 캐시에 반영 — DB 업데이트와 함께 호출한다 */
export function updateCachedCounselScenario(
  sessionId: string,
  scenarioId: string | null,
  stage: string | null
) {
  const cached = sessions.get(sessionId);
  if (cached) {
    cached.scenarioId = scenarioId;
    cached.stage = stage;
  }
}

/** 이번 턴을 활동으로 기록 — 재방문 판정의 기준 시각 갱신 */
export function touchCachedCounselSession(sessionId: string) {
  const cached = sessions.get(sessionId);
  if (cached) cached.lastTurnAt = Date.now();
}
