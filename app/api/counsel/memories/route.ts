import {
  recallMemories,
  flattenMemories,
  searchMemories,
  memoryEnabled,
} from "@/lib/supermemory";
import { EXTERNAL_ID_RE } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/counsel/memories?externalId=...&q=...
// 기억 패널/회상 표시용 — q 가 없으면 프로필(장기 사실 + 최근 맥락)을,
// q 가 있으면 질의 검색 결과를 반환한다.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const externalId = url.searchParams.get("externalId")?.trim();
  const q = (url.searchParams.get("q")?.trim() ?? "").slice(0, 200);

  if (!externalId || !EXTERNAL_ID_RE.test(externalId))
    return Response.json({ enabled: memoryEnabled(), memories: [] });

  const memories = q
    ? await searchMemories(externalId, q, 8, AbortSignal.timeout(3_000)).catch(() => [])
    : flattenMemories((await recallMemories(externalId, undefined, 3_000)).ctx);
  return Response.json({ enabled: memoryEnabled(), memories });
}
