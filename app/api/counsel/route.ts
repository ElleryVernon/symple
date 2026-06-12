import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  cacheCounselSession,
  getCachedCounselSession,
  touchCachedCounselSession,
} from "@/lib/counsel-session-cache";
import { streamChat, type ChatMsg } from "@/lib/openrouter";
import {
  recallMemories,
  flattenMemories,
  EMPTY_MEMORY,
  addMemory,
  memoryEnabled,
  type MemoryRecall,
} from "@/lib/supermemory";
import {
  buildSystemPrompt,
  buildMemoryRecord,
  OPENING_DIRECTIVE,
  VOICE_DIRECTIVE,
  stripControlMarkers,
  parseStageMarker,
  hasNewTopicMarker,
} from "@/lib/prompt";
import { rateLimit, clientIp, EXTERNAL_ID_RE } from "@/lib/rate-limit";
import { detectOverload, detectRisk } from "@/lib/counsel/risk";
import {
  classifyUtterance,
  routerEnabled,
  withinBudget,
  type ScenarioClassification,
} from "@/lib/counsel/router";
import { buildGuidanceSections } from "@/lib/counsel/playbook";
import {
  getScenarioById,
  isStageCode,
  type CallScenario,
  type StageCode,
} from "@/lib/counsel/guidelines";
import { updateCachedCounselScenario } from "@/lib/counsel-session-cache";
import type { PersonaId } from "@/components/counsel/data";

// Prisma + node-postgres + fetch 스트리밍 → Node 런타임 필수
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERSONAS: PersonaId[] = ["empathy", "solution", "aligned"];
const MAX_MESSAGE_LEN = 4000;
const MAX_HISTORY = 24;
const REQUEST_TIMEOUT_MS = 90_000;
// 회상은 요청 시작 즉시 DB 세션 준비와 병렬로 돌므로, 체감 추가 지연은
// max(0, 회상시간 - DB시간) 뿐 — 텍스트는 넉넉히, 음성은 첫 토큰 지연 보호를 위해 짧게.
const MEMORY_TIMEOUT_MS = 2_500;
const VOICE_MEMORY_TIMEOUT_MS = 1_200;
// 시나리오 분류는 기억 회상과 병렬 — 체감 추가 지연은 max(회상, 분류) 뿐이다.
// 제한 시간을 넘기면 이번 턴은 미분류(인테이크)로 진행하고, 늦게 도착한 결과는
// after() 에서 세션에 저장돼 다음 턴부터 적용된다.
const CLASSIFY_TIMEOUT_MS = 2_500;
const VOICE_CLASSIFY_TIMEOUT_MS = 1_200;
// 이 시간 이상 활동이 없던 세션에 돌아오면 "체크인(안부·미션 팔로업)" 디렉티브를
// 우선한다 — 어제의 단계 질문을 다짜고짜 이어가는 사고 방지.
const REVISIT_AFTER_MS = 6 * 60 * 60 * 1000;

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
  /** 텍스트 클라이언트가 이미 가진 최근 대화. 서버 캐시가 맞으면 DB history 읽기를 생략한다. */
  history?: Array<{
    id?: string;
    role?: "user" | "assistant";
    content?: string;
  }>;
}

interface StoredMessage {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
}

interface FinalState {
  content: string;
  reasoning: string;
  firstContentMs: number | null;
  interrupted: boolean;
  errored: boolean;
}

function parseClientHistory(history: Body["history"]): StoredMessage[] | null {
  if (!Array.isArray(history)) return null;
  const parsed: StoredMessage[] = [];
  for (const [index, message] of history.slice(-MAX_HISTORY).entries()) {
    if (
      !message ||
      (message.role !== "user" && message.role !== "assistant") ||
      typeof message.content !== "string"
    ) {
      return null;
    }
    parsed.push({
      id: message.id?.trim() || `client-${index}`,
      role: message.role,
      // 제어 마커가 클라이언트 상태(중단된 음성 턴 등)에 남아 있어도
      // LLM 컨텍스트로 되돌아가 패턴을 학습시키지 못하게 서버 입구에서 제거
      content: stripControlMarkers(message.content).slice(0, MAX_MESSAGE_LEN * 2),
      createdAt: new Date(index),
    });
  }
  return parsed;
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

  if (!externalId || !EXTERNAL_ID_RE.test(externalId))
    return Response.json({ error: "유효한 externalId 필요" }, { status: 400 });
  if (!persona || !PERSONAS.includes(persona))
    return Response.json({ error: "유효한 persona 필요" }, { status: 400 });

  // 남용 방지 — IP 60회/분(다계정 우회 방어, 식별될 때만) + 사용자 20회/분.
  const ip = clientIp(req);
  if ((ip && !rateLimit(`counsel:ip:${ip}`, 60, 60_000)) ||
      !rateLimit(`counsel:user:${externalId}`, 20, 60_000))
    return Response.json(
      { error: "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요." },
      { status: 429 }
    );
  if (userMessage && userMessage.length > MAX_MESSAGE_LEN)
    return Response.json(
      { error: `메시지가 너무 길어요 (최대 ${MAX_MESSAGE_LEN}자).` },
      { status: 400 }
    );
  if (editMessageId && !userMessage)
    return Response.json({ error: "수정할 내용이 비어 있어요." }, { status: 400 });

  // 기억 회상 — 매 턴 실행한다(ChatGPT 식). /v4/profile 한 호출로 장기 사실(static)
  // + 최근 맥락(dynamic) + 현재 발화 관련 검색(q)을 모두 가져오며, 아래 DB 세션
  // 준비와 병렬로 돌아 체감 지연을 거의 만들지 않는다. 제때 못 오면 직전 캐시로
  // 폴백하고(degraded), 그 사실을 프롬프트에 알려 '기억 없음' 단정을 막는다.
  const memoryPromise: Promise<MemoryRecall> = memoryEnabled()
    ? recallMemories(
        externalId,
        userMessage || "최근 상담에서 지금 이어서 확인할 핵심 내용",
        voice ? VOICE_MEMORY_TIMEOUT_MS : MEMORY_TIMEOUT_MS
      )
    : Promise.resolve({ ctx: EMPTY_MEMORY, degraded: false });

  let sessionId = "";
  let userId = "";
  let recent: StoredMessage[] = [];
  let sessionScenarioId: string | null = null;
  let sessionStage: string | null = null;
  /** 직전 활동 시각 — 재방문(체크인) 판정. 새 세션이면 null */
  let lastActiveAt: number | null = null;
  const clientHistory =
    userMessage && !regenerate && !editMessageId ? parseClientHistory(body.history) : null;

  try {
    const cached = body.sessionId
      ? getCachedCounselSession(body.sessionId, externalId)
      : null;

    if (body.sessionId && cached && clientHistory) {
      sessionId = body.sessionId;
      userId = cached.userId;
      sessionScenarioId = cached.scenarioId;
      sessionStage = cached.stage;
      lastActiveAt = cached.lastTurnAt;
      recent = clientHistory;
      touchCachedCounselSession(sessionId);
    } else {
      const existing = body.sessionId
      ? await prisma.session.findFirst({
          where: { id: body.sessionId, user: { externalId } },
          select: {
            id: true,
            userId: true,
            scenarioId: true,
            stage: true,
            updatedAt: true,
            messages: {
              orderBy: { createdAt: "desc" },
              take: MAX_HISTORY,
              select: { id: true, role: true, content: true, createdAt: true },
            },
          },
        })
      : null;

      if (existing) {
        sessionId = existing.id;
        userId = existing.userId;
        sessionScenarioId = existing.scenarioId;
        sessionStage = existing.stage;
        lastActiveAt = existing.updatedAt.getTime();
        recent = clientHistory ?? existing.messages.reverse();
      } else {
        const user = await prisma.user.upsert({
          where: { externalId },
          create: { externalId },
          update: {},
        });
        const session = await prisma.session.create({ data: { userId: user.id, persona } });
        sessionId = session.id;
        userId = user.id;
      }
      cacheCounselSession(sessionId, externalId, userId, sessionScenarioId, sessionStage);
    }
  } catch (e) {
    console.error("[counsel] session setup failed:", e);
    const msg = (e as { message?: string })?.message ?? "데이터베이스 연결에 실패했습니다.";
    return Response.json({ error: `상담 준비 실패: ${msg}` }, { status: 503 });
  }

  let inputPersistence: Promise<unknown> = Promise.resolve();
  const persistInput = (promise: Promise<unknown>) =>
    promise.catch((e) => console.error("[counsel] persist input failed:", e));

  // regenerate/edit 시 단계 롤백 — 삭제되는 응답이 진행시킨 단계가 세션에 남아
  // 재생성 응답이 "삭제된 대화 기준"의 단계 디렉티브를 받는 드리프트를 막는다.
  // 기준은 잘리는 지점 이전의 마지막 assistant 메시지에 기록된 단계.
  let stageRollback: StageCode | null = null;
  const findStageBefore = async (cutoff: Date): Promise<StageCode | null> => {
    const prev = await prisma.message.findFirst({
      where: { sessionId, role: "assistant", createdAt: { lt: cutoff } },
      orderBy: { createdAt: "desc" },
      select: { stage: true },
    });
    if (!prev) return "A"; // 남는 assistant 응답이 없음 — 처음으로
    // stage 컬럼 도입 이전의 응답이면 알 수 없음 — 현재 단계 유지가 안전
    return prev.stage && isStageCode(prev.stage) ? prev.stage : null;
  };
  const createUserMessage = async (content: string) => {
    await prisma.message.create({
      data: {
        ...(userMessageId ? { id: userMessageId } : {}),
        sessionId,
        userId,
        role: "user",
        content,
      },
    });
    await prisma.session.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });
  };

  try {
    if (regenerate) {
      const lastAssistantIndex = recent.findLastIndex((m) => m.role === "assistant");
      const lastAssistant = recent[lastAssistantIndex];
      if (lastAssistant) {
        recent.splice(lastAssistantIndex, 1);
        if (sessionScenarioId) {
          stageRollback = await findStageBefore(lastAssistant.createdAt);
        }
        inputPersistence = persistInput(
          prisma.message.delete({ where: { id: lastAssistant.id } })
        );
      }
    } else if (editMessageId && userMessage) {
      let target = recent.find((m) => m.id === editMessageId && m.role === "user");
      if (!target) {
        target =
          (await prisma.message.findFirst({
            where: { id: editMessageId, sessionId, role: "user" },
            select: { id: true, role: true, content: true, createdAt: true },
          })) ?? undefined;
      }

      if (target) {
        if (!recent.some((m) => m.id === target.id)) {
          recent = (
            await prisma.message.findMany({
              where: { sessionId, createdAt: { lt: target.createdAt } },
              orderBy: { createdAt: "desc" },
              take: MAX_HISTORY - 1,
              select: { id: true, role: true, content: true, createdAt: true },
            })
          ).reverse();
        } else {
          recent = recent.slice(0, recent.findIndex((m) => m.id === target.id));
        }

        if (sessionScenarioId) {
          stageRollback = await findStageBefore(target.createdAt);
        }
        inputPersistence = persistInput(
          (async () => {
            await prisma.message.deleteMany({
              where: { sessionId, createdAt: { gte: target.createdAt } },
            });
            await createUserMessage(userMessage);
          })()
        );
      } else {
        inputPersistence = persistInput(createUserMessage(userMessage));
      }
      recent.push({
        id: userMessageId || `pending-${Date.now()}`,
        role: "user",
        content: userMessage,
        createdAt: new Date(),
      });
    } else if (userMessage) {
      recent.push({
        id: userMessageId || `pending-${Date.now()}`,
        role: "user",
        content: userMessage,
        createdAt: new Date(),
      });
      inputPersistence = persistInput(createUserMessage(userMessage));
    }
  } catch (e) {
    console.error("[counsel] context preparation failed:", e);
    return Response.json({ error: "대화 내용을 준비하지 못했어요." }, { status: 503 });
  }

  // ── 가이드라인 라우팅 ──────────────────────────────────────────────────
  // 위험·과부하 감지는 결정적(키워드) — LLM·라우팅 장애와 무관하게 항상 동작한다.
  const risk = detectRisk(userMessage);
  const overload = detectOverload(userMessage);

  // 세션에 시나리오가 없고 실제 발화가 있으면 분류를 시작한다(기억 회상과 병렬).
  let scenario: CallScenario | null = sessionScenarioId
    ? getScenarioById(sessionScenarioId)
    : null;
  let stage: StageCode =
    sessionStage && isStageCode(sessionStage) ? sessionStage : "A";

  // 분류 입력은 최근 사용자 발화까지 포함 — 첫 턴에 제한 시간을 넘겨 미분류로
  // 남았던 세션도 다음 턴에서 대화 맥락 전체로 더 정확히 재분류된다.
  const classifierInput = recent
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => m.content)
    .join("\n");
  const classifyPromise: Promise<ScenarioClassification | null> | null =
    !scenario && userMessage && routerEnabled()
      ? classifyUtterance(classifierInput || userMessage)
      : null;

  const persistScenarioState = (
    nextScenarioId: string | null,
    nextStage: StageCode | null
  ) => {
    updateCachedCounselScenario(sessionId, nextScenarioId, nextStage);
    return prisma.session
      .update({
        where: { id: sessionId },
        data: { scenarioId: nextScenarioId, stage: nextStage },
      })
      .catch((e) => console.error("[counsel] persist scenario failed:", e));
  };

  // regenerate/edit 가 잘라낸 지점 이전의 단계로 복귀
  if (stageRollback && stageRollback !== stage) {
    stage = stageRollback;
    if (scenario) void persistScenarioState(scenario.scenario_id, stage);
  }

  const [{ ctx: memory, degraded: memoryDegraded }, classified] = await Promise.all([
    memoryPromise,
    classifyPromise
      ? withinBudget(classifyPromise, voice ? VOICE_CLASSIFY_TIMEOUT_MS : CLASSIFY_TIMEOUT_MS)
      : Promise.resolve(null),
  ]);

  if (classified) {
    scenario = classified.scenario;
    stage = "A";
    void persistScenarioState(scenario.scenario_id, stage);
  }

  // 직전 답변들이 연속으로 질문으로 끝났는지 — 질문 강박을 서버가 결정적으로 끊는다
  let questionStreak = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    if (m.role !== "assistant") continue;
    const tail = m.content.trimEnd();
    if (tail.endsWith("?") || tail.endsWith("？")) questionStreak++;
    else break;
  }

  // 마지막 활동에서 오래 지난 세션으로의 복귀 — 대화가 실제로 있었던 세션만
  const revisit =
    lastActiveAt !== null &&
    Date.now() - lastActiveAt > REVISIT_AFTER_MS &&
    recent.some((m) => m.role === "assistant");

  const recalled = flattenMemories(memory);
  const guidance = buildGuidanceSections({
    mode: voice ? "call" : "text",
    scenario,
    stage: scenario ? stage : null,
    risk,
    overload,
    questionStreak,
    revisit,
  });
  const systemPrompt =
    buildSystemPrompt(persona, memory, memoryDegraded, guidance) +
    (voice ? `\n\n${VOICE_DIRECTIVE}` : "");

  const llmMessages: ChatMsg[] = [{ role: "system", content: systemPrompt }];
  if (recent.length === 0) {
    llmMessages.push({ role: "user", content: OPENING_DIRECTIVE });
  } else {
    for (const message of recent) {
      llmMessages.push({
        role: message.role === "user" ? "user" : "assistant",
        content: message.content,
      });
    }
  }

  let resolveFinalState!: (state: FinalState) => void;
  const finalStatePromise = new Promise<FinalState>((resolve) => {
    resolveFinalState = resolve;
  });

  after(async () => {
    const state = await finalStatePromise;
    await inputPersistence;

    // 마커 처리 — 중단/오류 턴의 마커는 신뢰하지 않는다.
    // [새주제]: 시나리오·단계를 비워 다음 턴에 재분류 (단계 마커보다 우선)
    // [단계:X]: "이 답변을 마친 시점의 단계"를 세션에 반영해 다음 턴 디렉티브로 회귀
    const markerStage = parseStageMarker(state.content);
    let messageStage: StageCode | null = null;
    if (scenario && !state.errored && !state.interrupted) {
      if (hasNewTopicMarker(state.content)) {
        await persistScenarioState(null, null);
      } else {
        messageStage = markerStage ?? stage;
        if (markerStage && markerStage !== stage) {
          await persistScenarioState(scenario.scenario_id, markerStage);
        }
      }
    } else if (!scenario && classifyPromise) {
      // 제한 시간을 넘겨 늦게 도착한 분류 — 다음 턴부터 적용되도록 저장만 한다
      const late = await classifyPromise;
      if (late) await persistScenarioState(late.scenario.scenario_id, "A");
    }

    // 제어 마커(통화 종료·단계·새주제)는 내부 신호 — 저장본(대화/기억)에는 남기지 않는다
    const assistantContent = stripControlMarkers(state.content).trim();

    if (assistantContent || state.reasoning) {
      await prisma.message
        .create({
          data: {
            sessionId,
            userId,
            role: "assistant",
            content: assistantContent,
            reasoning: state.reasoning || null,
            thinkMs: state.reasoning ? state.firstContentMs : null,
            interrupted: state.interrupted,
            // 응답 시점의 단계 기록 — regenerate/edit 단계 롤백의 기준점
            stage: messageStage,
          },
        })
        .catch((e) => console.error("[counsel] persist assistant failed:", e));
    }

    if (
      !state.errored &&
      !state.interrupted &&
      assistantContent &&
      userMessage
    ) {
      await addMemory(externalId, buildMemoryRecord(userMessage, assistantContent), {
        sessionId,
        persona,
      }).catch((e) => console.error("[counsel] addMemory failed:", e));
    }
  });

  const encoder = new TextEncoder();
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const upstreamSignal = AbortSignal.any([req.signal, timeoutSignal]);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          /* 클라이언트 연결 종료 */
        }
      };

      send({
        type: "meta",
        sessionId,
        memoryCount: recalled.length,
        memoryEnabled: memoryEnabled(),
        ...(recalled.length ? { memories: recalled } : {}),
        // 관측용 — 어떤 플레이북·단계로 응답이 생성됐는지 (UI 미사용, 디버깅·로깅용)
        ...(scenario
          ? {
              scenario: {
                id: scenario.scenario_id,
                label: `${scenario.chief_complaint_label} · ${scenario.subtheme_label}`,
                stage,
              },
            }
          : {}),
      });

      let content = "";
      let reasoning = "";
      const startedAt = Date.now();
      let firstContentMs: number | null = null;
      let interrupted = false;
      let errored = false;

      try {
        const options = voice
          ? {
              reasoningEffort: (process.env.OPENROUTER_VOICE_REASONING_EFFORT?.trim() ||
                "low") as "minimal" | "low" | "medium" | "high",
            }
          : undefined;

        for await (const delta of streamChat(llmMessages, upstreamSignal, options)) {
          if (delta.type === "reasoning") {
            reasoning += delta.text;
            send({ type: "reasoning", delta: delta.text });
          } else {
            if (firstContentMs === null) firstContentMs = Date.now() - startedAt;
            content += delta.text;
            send({ type: "content", delta: delta.text });
          }
        }
        send({ type: "done" });
      } catch (e) {
        const err = e as { message?: string };
        if (req.signal.aborted) {
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
        resolveFinalState({
          content,
          reasoning,
          firstContentMs,
          interrupted,
          errored,
        });
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
