/**
 * supermemory 클라이언트 — 세션 간 기억(장기 기억).
 * containerTag = 사용자 외부 id 로 스코프되어, 새 세션을 열어도 기억이 이어진다.
 *
 * 키가 없으면(SUPERMEMORY_API_KEY 미설정) 조용히 비활성화되어 앱은 정상 동작한다.
 */

const BASE = "https://api.supermemory.ai/v3";

const apiKey = () => process.env.SUPERMEMORY_API_KEY?.trim();

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey()}`,
  };
}

/** 관련 기억을 검색해 사람이 읽을 수 있는 스니펫 배열로 반환 */
export async function searchMemories(
  containerTag: string,
  query: string,
  limit = 6,
  signal?: AbortSignal
): Promise<string[]> {
  if (!apiKey()) return [];
  try {
    const res = await fetch(`${BASE}/search`, {
      method: "POST",
      headers: headers(),
      signal,
      body: JSON.stringify({
        q: query || "최근 상담 내용",
        containerTags: [containerTag],
        limit,
        rerank: true,
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{
        content?: string;
        summary?: string;
        chunks?: Array<{ content?: string; isRelevant?: boolean }>;
      }>;
    };
    const out: string[] = [];
    for (const r of data.results ?? []) {
      const relevant = (r.chunks ?? [])
        .filter((c) => c.isRelevant !== false && c.content)
        .map((c) => c.content!.trim());
      const snippet = relevant[0] ?? r.summary ?? r.content;
      if (snippet) out.push(snippet.trim());
    }
    // 중복 제거 + 길이 제한
    return [...new Set(out)].slice(0, limit);
  } catch {
    return [];
  }
}

/** 대화에서 기억할 내용을 저장 (supermemory 가 추출/임베딩 처리) */
export async function addMemory(
  containerTag: string,
  content: string,
  metadata?: Record<string, string | number | boolean>
): Promise<void> {
  if (!apiKey() || !content.trim()) return;
  try {
    await fetch(`${BASE}/documents`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        content,
        containerTags: [containerTag],
        metadata,
      }),
    });
  } catch {
    /* 기억 저장 실패는 상담 흐름을 막지 않는다 */
  }
}

export const memoryEnabled = () => !!apiKey();
