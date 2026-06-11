import { searchMemories, memoryEnabled } from "@/lib/supermemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/counsel/memories?externalId=...&q=...
// 기억 패널/회상 표시용 — 사용자의 저장된 기억 스니펫을 반환.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const externalId = url.searchParams.get("externalId")?.trim();
  const q = url.searchParams.get("q")?.trim() ?? "";

  if (!externalId) return Response.json({ enabled: memoryEnabled(), memories: [] });

  const memories = await searchMemories(externalId, q, 8).catch(() => []);
  return Response.json({ enabled: memoryEnabled(), memories });
}
