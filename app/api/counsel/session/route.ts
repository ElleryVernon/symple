import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/counsel/session?externalId=..&sessionId=..
// 새로고침 시 대화를 이어가기 위해 세션 + 메시지를 복원한다.
// sessionId 가 없으면 가장 최근(내용이 있는) 세션을 반환.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const externalId = url.searchParams.get("externalId")?.trim();
  const sessionId = url.searchParams.get("sessionId")?.trim();

  if (!externalId) return Response.json({ session: null, messages: [] });

  try {
    const user = await prisma.user.findUnique({ where: { externalId } });
    if (!user) return Response.json({ session: null, messages: [] });

    const session = sessionId
      ? await prisma.session.findFirst({ where: { id: sessionId, userId: user.id } })
      : await prisma.session.findFirst({
          where: { userId: user.id, messages: { some: {} } },
          orderBy: { updatedAt: "desc" },
        });

    if (!session) return Response.json({ session: null, messages: [] });

    const messages = await prisma.message.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        reasoning: true,
        thinkMs: true,
        interrupted: true,
      },
    });

    return Response.json({
      session: { id: session.id, persona: session.persona },
      messages,
    });
  } catch (e) {
    console.error("[counsel] session restore failed:", e);
    return Response.json({ session: null, messages: [] });
  }
}
