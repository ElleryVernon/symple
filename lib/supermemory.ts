/**
 * supermemory 클라이언트 — 세션 간 기억(장기 기억).
 * containerTag = 사용자 외부 id 로 스코프되어, 새 세션을 열어도 기억이 이어진다.
 *
 * 회상은 /v4/profile 한 호출(~50ms대)로 해결한다:
 *  - profile.static  : 사용자에 대한 장기 사실 (ChatGPT 의 '저장된 기억'에 해당)
 *  - profile.dynamic : 최근 상담에서의 맥락
 *  - searchResults   : q(현재 발화)와 관련된 기억 검색 결과
 *
 * 키가 없으면(SUPERMEMORY_API_KEY 미설정) 조용히 비활성화되어 앱은 정상 동작한다.
 */

const BASE = "https://api.supermemory.ai";

const apiKey = () => process.env.SUPERMEMORY_API_KEY?.trim();

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey()}`,
  };
}

export interface MemoryContext {
  /** 장기 사실 — 사용자 프로필(이름·상황·관계·반복 주제 등) */
  statics: string[];
  /** 최근 상담에서의 맥락 */
  dynamics: string[];
  /** 현재 발화와 관련해 검색된 기억 */
  related: string[];
}

export const EMPTY_MEMORY: MemoryContext = { statics: [], dynamics: [], related: [] };

export function flattenMemories(ctx: MemoryContext): string[] {
  return [...new Set([...ctx.statics, ...ctx.dynamics, ...ctx.related])];
}

/** 응답 항목이 문자열이든 {memory|chunk|content} 객체든 텍스트로 정규화 */
function toText(item: unknown): string | null {
  if (typeof item === "string") return item.trim() || null;
  if (item && typeof item === "object") {
    const o = item as { memory?: string; chunk?: string; content?: string; summary?: string };
    const t = o.memory ?? o.chunk ?? o.content ?? o.summary;
    return typeof t === "string" && t.trim() ? t.trim() : null;
  }
  return null;
}

function dedupe(list: Array<string | null>, cap: number): string[] {
  return [...new Set(list.filter((x): x is string => !!x))].slice(0, cap);
}

/* ── 프로필 캐시 — containerTag → 마지막 성공 회상.
 * static/dynamic 은 느리게 변하므로, 이번 턴 호출이 늦거나 실패해도 직전 값으로
 * 폴백한다(stale-while-revalidate). 타임아웃에 진 호출도 끝까지 받아 캐시를
 * 갱신하므로 다음 턴은 즉시 회상된다. */
const profileCache = new Map<string, { ctx: MemoryContext; at: number }>();
const CACHE_FALLBACK_MS = 10 * 60_000; // 이보다 오래된 캐시로는 폴백하지 않는다
const MAX_CACHED_PROFILES = 500; // 방문자(봇 포함)당 1엔트리 — 무한 증식 방지
const FETCH_HARD_TIMEOUT_MS = 10_000;

function cacheProfile(containerTag: string, ctx: MemoryContext) {
  profileCache.delete(containerTag); // 재삽입으로 최신 순서 유지(삽입순 퇴출)
  profileCache.set(containerTag, { ctx, at: Date.now() });
  if (profileCache.size > MAX_CACHED_PROFILES) {
    const oldest = profileCache.keys().next().value;
    if (oldest !== undefined) profileCache.delete(oldest);
  }
}

async function fetchProfile(containerTag: string, query?: string): Promise<MemoryContext> {
  const res = await fetch(`${BASE}/v4/profile`, {
    method: "POST",
    headers: headers(),
    signal: AbortSignal.timeout(FETCH_HARD_TIMEOUT_MS),
    body: JSON.stringify({
      containerTag,
      ...(query?.trim() ? { q: query.trim() } : {}),
    }),
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`profile ${res.status}: ${body}`);
  }
  const data = (await res.json()) as {
    profile?: { static?: unknown[]; dynamic?: unknown[] };
    searchResults?: { results?: unknown[] };
  };
  const statics = dedupe((data.profile?.static ?? []).map(toText), 12);
  const dynamics = dedupe((data.profile?.dynamic ?? []).map(toText), 8);
  const seen = new Set([...statics, ...dynamics]);
  const related = dedupe((data.searchResults?.results ?? []).map(toText), 6).filter(
    (m) => !seen.has(m)
  );
  const ctx = { statics, dynamics, related };
  cacheProfile(containerTag, ctx);
  return ctx;
}

export interface MemoryRecall {
  ctx: MemoryContext;
  /**
   * true = 이번 턴 회상이 실패해 캐시/빈값으로 폴백했다는 뜻.
   * '저장된 기억이 없다'와 다르다 — 프롬프트에서 기억 없음을 단정하면 안 된다.
   */
  degraded: boolean;
}

/**
 * 사용자 프로필(장기 사실 + 최근 맥락) + 현재 발화 관련 기억을 회상한다.
 * waitMs 안에 오면 신선한 값, 늦으면 직전 캐시(degraded), 그것도 없으면 빈값(degraded).
 */
export async function recallMemories(
  containerTag: string,
  query: string | undefined,
  waitMs: number
): Promise<MemoryRecall> {
  if (!apiKey()) return { ctx: EMPTY_MEMORY, degraded: false };

  // 실패는 null 로 정규화 — 타임아웃에 져도 fetchProfile 은 계속 진행돼 캐시를 채운다
  const inflight = fetchProfile(containerTag, query).catch((e) => {
    console.error("[supermemory] profile failed:", e);
    return null;
  });
  let cancelTimer = () => {};
  const winner = await Promise.race([
    inflight,
    new Promise<undefined>((resolve) => {
      const t = setTimeout(resolve, waitMs);
      cancelTimer = () => clearTimeout(t);
    }),
  ]).finally(() => cancelTimer()); // fetch 가 이겨도 타이머를 남기지 않는다

  // fetch 가 제때 성공 — 빈 결과여도 '확인된 빈 기억'이므로 degraded 아님
  if (winner) return { ctx: winner, degraded: false };

  const cached = profileCache.get(containerTag);
  if (cached && Date.now() - cached.at < CACHE_FALLBACK_MS) {
    return { ctx: cached.ctx, degraded: true };
  }
  return { ctx: EMPTY_MEMORY, degraded: true };
}

/** 부팅/세션 복원 시 미리 호출 — 연결을 데우고 캐시를 채워 첫 턴부터 즉시 회상되게 한다 */
export function prefetchMemories(containerTag: string): void {
  if (!apiKey()) return;
  fetchProfile(containerTag).catch(() => {});
}

/** 질의 기반 기억 검색(기억 패널의 검색용) — /v4/search, 추출된 기억+원문 하이브리드 */
export async function searchMemories(
  containerTag: string,
  query: string,
  limit = 8,
  signal?: AbortSignal
): Promise<string[]> {
  if (!apiKey()) return [];
  try {
    const res = await fetch(`${BASE}/v4/search`, {
      method: "POST",
      headers: headers(),
      signal,
      body: JSON.stringify({
        q: query || "최근 상담 내용",
        containerTag,
        searchMode: "hybrid",
        limit,
        rerank: true,
      }),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 200);
      console.error("[supermemory] search failed:", res.status, body);
      return [];
    }
    const data = (await res.json()) as { results?: unknown[] };
    return dedupe((data.results ?? []).map(toText), limit);
  } catch {
    return [];
  }
}

/**
 * 대화에서 기억할 내용을 저장 (supermemory 가 추출·프로필 반영 처리).
 * 실패는 반드시 로그로 남긴다 — 저장이 조용히 죽으면 '기억 0'을 진단할 수 없다.
 */
export async function addMemory(
  containerTag: string,
  content: string,
  metadata?: Record<string, string | number | boolean>
): Promise<void> {
  if (!apiKey() || !content.trim()) return;
  try {
    const res = await fetch(`${BASE}/v3/documents`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        content,
        containerTags: [containerTag],
        metadata,
      }),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 200);
      console.error("[supermemory] add failed:", res.status, body);
    }
  } catch (e) {
    console.error("[supermemory] add error:", e);
  }
}

/**
 * 컨테이너 태그의 모든 문서·기억 삭제 — 전체 초기화(테스트/데이터 삭제 요청)용.
 * supermemory 가 태그와 그 안의 문서·추출 기억을 한 번에 지운다.
 */
export async function deleteAllMemories(containerTag: string): Promise<boolean> {
  profileCache.delete(containerTag); // 회상 캐시도 함께 — 삭제 후 유령 회상 방지
  if (!apiKey()) return true; // 기능 비활성 — 지울 것이 없다
  try {
    const res = await fetch(`${BASE}/v3/container-tags/${encodeURIComponent(containerTag)}`, {
      method: "DELETE",
      headers: headers(),
      signal: AbortSignal.timeout(FETCH_HARD_TIMEOUT_MS),
    });
    if (res.ok || res.status === 404) return true; // 404 — 기억이 없던 태그
    const body = (await res.text().catch(() => "")).slice(0, 200);
    console.error("[supermemory] container delete failed:", res.status, body);
    return false;
  } catch (e) {
    console.error("[supermemory] container delete error:", e);
    return false;
  }
}

export const memoryEnabled = () => !!apiKey();
