import { prisma } from "@/lib/prisma";
import { cacheCounselSession } from "@/lib/counsel-session-cache";
import { deleteAllMemories, prefetchMemories } from "@/lib/supermemory";
import { clientIp, EXTERNAL_ID_RE, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/counsel/session?externalId=..&sessionId=..
// 새로고침 시 대화를 이어가기 위해 세션 + 메시지를 복원한다.
// sessionId 가 없으면 가장 최근(내용이 있는) 세션을 반환.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const externalId = url.searchParams.get("externalId")?.trim();
  const sessionId = url.searchParams.get("sessionId")?.trim();

  if (!externalId || !EXTERNAL_ID_RE.test(externalId))
    return Response.json({ session: null, messages: [] });

  // 부팅 시점에 supermemory 프로필을 미리 받아 캐시를 채운다 —
  // 첫 메시지 턴부터 타임아웃 걱정 없이 즉시 회상된다(결과는 기다리지 않음).
  prefetchMemories(externalId);

  try {
    const session = sessionId
      ? await prisma.session.findFirst({
          where: { id: sessionId, user: { externalId } },
          select: {
            id: true,
            userId: true,
            persona: true,
            messages: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                role: true,
                content: true,
                reasoning: true,
                thinkMs: true,
                interrupted: true,
              },
            },
          },
        })
      : await prisma.session.findFirst({
          where: { user: { externalId }, messages: { some: {} } },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            userId: true,
            persona: true,
            messages: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                role: true,
                content: true,
                reasoning: true,
                thinkMs: true,
                interrupted: true,
              },
            },
          },
        });

    if (!session) return Response.json({ session: null, messages: [] });
    cacheCounselSession(session.id, externalId, session.userId);

    return Response.json({
      session: { id: session.id, persona: session.persona },
      messages: session.messages,
    });
  } catch (e) {
    console.error("[counsel] session restore failed:", e);
    return Response.json({ session: null, messages: [] });
  }
}

// DELETE /api/counsel/session?externalId=..
// 이 사용자의 모든 대화 세션(메시지 cascade)과 supermemory 기억을 삭제한다.
// externalId 가 곧 인증 토큰인 기존 신뢰 모델을 그대로 따른다(다른 API 와 동일).
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const externalId = url.searchParams.get("externalId")?.trim();

  if (!externalId || !EXTERNAL_ID_RE.test(externalId))
    return Response.json({ error: "유효한 externalId 필요" }, { status: 400 });

  // 파괴적 작업 — 보수적으로 제한
  const ip = clientIp(req);
  if (
    (ip && !rateLimit(`counsel:wipe:ip:${ip}`, 10, 60_000)) ||
    !rateLimit(`counsel:wipe:user:${externalId}`, 5, 60_000)
  )
    return Response.json({ error: "요청이 너무 잦아요." }, { status: 429 });

  try {
    const memoryDeleted = await deleteAllMemories(externalId);
    // User 삭제 → Session·Message cascade
    const removed = await prisma.user.deleteMany({ where: { externalId } });
    return Response.json({ ok: true, memoryDeleted, usersDeleted: removed.count });
  } catch (e) {
    console.error("[counsel] wipe failed:", e);
    return Response.json({ error: "삭제에 실패했어요." }, { status: 503 });
  }
}
