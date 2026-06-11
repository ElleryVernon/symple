import { prisma } from "@/lib/prisma";
import { streamChat, type ChatMsg } from "@/lib/openrouter";
import { searchMemories, addMemory, memoryEnabled } from "@/lib/supermemory";
import {
  buildSystemPrompt,
  buildMemoryRecord,
  OPENING_DIRECTIVE,
  VOICE_DIRECTIVE,
} from "@/lib/prompt";
import type { PersonaId } from "@/components/counsel/data";

// Prisma + node-postgres + fetch 스트리밍 → Node 런타임 필수
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERSONAS: PersonaId[] = ["empathy", "solution", "aligned"];
const MAX_MESSAGE_LEN = 4000; // 한 메시지 최대 길이
const MAX_HISTORY = 24; // 모델에 보내는 최근 메시지 수(토큰/비용 상한)
const REQUEST_TIMEOUT_MS = 90_000; // OpenRouter 응답 타임아웃

interface Body {
  externalId?: string;
  sessionId?: string | null;
  persona?: PersonaId;
  userMessage?: string;
  /** 클라이언트가 부여하는 유저 메시지 id(= DB id) */
  userMessageId?: string;
  regenerate?: boolean;
  /** 이 유저 메시지를 수정 — 해당 메시지 이후를 모두 잘라내고 새 내용으로 재생성 */
  editMessageId?: string;
  /** 음성 모드 — 짧은 구어체 + 낮은 reasoning effort 로 첫 토큰 지연 최소화 */
  voice?: boolean;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  const externalId = body.externalId?.trim();
  const persona = body.persona;
  const userMessage = body.userMessage?.trim();
  const userMessageId = body.userMessageId?.trim();
  const regenerate = body.regenerate === true;
  const editMessageId = body.editMessageId?.trim();
  const voice = body.voice === true;

  if (!externalId) return Response.json({ error: "externalId 필요" }, { status: 400 });
  if (!persona || !PERSONAS.includes(persona))
    return Response.json({ error: "유효한 persona 필요" }, { status: 400 });
  if (userMessage && userMessage.length > MAX_MESSAGE_LEN)
    return Response.json(
      { error: `메시지가 너무 길어요 (최대 ${MAX_MESSAGE_LEN}자).` },
      { status: 400 }
    );
  if (editMessageId && !userMessage)
    return Response.json({ error: "수정할 내용이 비어 있어요." }, { status: 400 });

  // DB / 기억 준비 (실패 시 깔끔한 에러 반환 — 스트림 시작 전)
  let sessionId: string;
  let userId: string;
  let memories: string[] = [];
  const llmMessages: ChatMsg[] = [];
  try {
    // 1) 사용자 보장 + 세션 확보(없으면 생성)
    const user = await prisma.user.upsert({
      where: { externalId },
      create: { externalId },
      update: {},
    });
    userId = user.id;

    let session = body.sessionId
      ? await prisma.session.findFirst({ where: { id: body.sessionId, userId: user.id } })
      : null;
    if (!session) {
      session = await prisma.session.create({ data: { userId: user.id, persona } });
    }
    sessionId = session.id;

    // 2) 입력 반영: regenerate | edit | 일반 사용자 메시지
    if (regenerate) {
      // 마지막 어시스턴트 응답을 지워 같은 맥락으로 다시 생성
      const last = await prisma.message.findFirst({
        where: { sessionId: session.id, role: "assistant" },
        orderBy: { createdAt: "desc" },
      });
      if (last) await prisma.message.delete({ where: { id: last.id } });
    } else if (editMessageId) {
      // 수정 대상 유저 메시지 이후를 모두 잘라내고 새 내용으로 교체
      const target = await prisma.message.findFirst({
        where: { id: editMessageId, sessionId: session.id, role: "user" },
      });
      if (target) {
        await prisma.message.deleteMany({
          where: { sessionId: session.id, createdAt: { gte: target.createdAt } },
        });
      }
      await prisma.message.create({
        data: {
          ...(userMessageId ? { id: userMessageId } : {}),
          sessionId: session.id,
          userId: user.id,
          role: "user",
          content: userMessage!,
        },
      });
      await prisma.session.update({ where: { id: session.id }, data: { updatedAt: new Date() } });
    } else if (userMessage) {
      await prisma.message.create({
        data: {
          ...(userMessageId ? { id: userMessageId } : {}),
          sessionId: session.id,
          userId: user.id,
          role: "user",
          content: userMessage,
        },
      });
      await prisma.session.update({ where: { id: session.id }, data: { updatedAt: new Date() } });
    }

    // 3) 기억 검색 (containerTag = externalId → 세션이 바뀌어도 유지)
    memories = await searchMemories(externalId, userMessage ?? "", 6).catch(() => []);

    // 4) LLM 메시지 구성: system + 최근 이력(MAX_HISTORY)
    const history = await prisma.message.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true },
    });
    const recent = history.slice(-MAX_HISTORY);

    const systemPrompt =
      buildSystemPrompt(persona, memories) + (voice ? `\n\n${VOICE_DIRECTIVE}` : "");
    llmMessages.push({ role: "system", content: systemPrompt });
    if (recent.length === 0) {
      llmMessages.push({ role: "user", content: OPENING_DIRECTIVE });
    } else {
      for (const m of recent) {
        llmMessages.push({ role: m.role === "user" ? "user" : "assistant", content: m.content });
      }
    }
  } catch (e) {
    console.error("[counsel] setup failed:", e);
    const msg = (e as { message?: string })?.message ?? "데이터베이스 연결에 실패했습니다.";
    return Response.json({ error: `상담 준비 실패: ${msg}` }, { status: 503 });
  }

  const encoder = new TextEncoder();
  // 사용자 중단(req.signal) 또는 타임아웃 중 먼저 오는 쪽으로 OpenRouter 호출을 끊는다.
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const upstreamSignal = AbortSignal.any([req.signal, timeoutSignal]);
  const memoryText = userMessage;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          /* 클라이언트 연결 종료 — 무시 */
        }
      };

      send({ type: "meta", sessionId, memoryCount: memories.length, memoryEnabled: memoryEnabled() });

      let content = "";
      let reasoning = "";
      const startedAt = Date.now();
      let firstContentMs: number | null = null;
      let interrupted = false;
      let errored = false;

      try {
        const llmOpts = voice
          ? {
              reasoningEffort: (process.env.OPENROUTER_VOICE_REASONING_EFFORT?.trim() ||
                "low") as "minimal" | "low" | "medium" | "high",
            }
          : undefined;
        for await (const d of streamChat(llmMessages, upstreamSignal, llmOpts)) {
          if (d.type === "reasoning") {
            reasoning += d.text;
            send({ type: "reasoning", delta: d.text });
          } else {
            if (firstContentMs === null) firstContentMs = Date.now() - startedAt;
            content += d.text;
            send({ type: "content", delta: d.text });
          }
        }
        send({ type: "done" });
      } catch (e) {
        const err = e as { name?: string; message?: string };
        if (req.signal.aborted) {
          // 사용자가 중단/끼어들기
          interrupted = true;
        } else if (timeoutSignal.aborted) {
          errored = true;
          send({ type: "error", message: "응답 시간이 초과되었어요. 다시 시도해 주세요." });
        } else {
          errored = true;
          console.error("[counsel] stream error:", err?.message ?? e);
          send({ type: "error", message: err?.message ?? "생성 중 오류가 발생했습니다." });
        }
      } finally {
        // 부분 응답이라도 보존(끼어들기/중단 시 interrupted=true)
        if (content || reasoning) {
          await prisma.message
            .create({
              data: {
                sessionId,
                userId,
                role: "assistant",
                content,
                reasoning: reasoning || null,
                thinkMs: firstContentMs,
                interrupted,
              },
            })
            .catch((e) => console.error("[counsel] persist assistant failed:", e));
        }
        // 정상 완료 + 사용자 발화가 있던 턴만 기억에 저장
        if (!errored && !interrupted && content && memoryText) {
          await addMemory(externalId, buildMemoryRecord(memoryText, content), {
            sessionId,
            persona,
          }).catch((e) => console.error("[counsel] addMemory failed:", e));
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
