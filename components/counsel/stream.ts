/**
 * 클라이언트 스트리밍 — /api/counsel 의 NDJSON 스트림을 읽어 콜백으로 전달.
 * (목업 streamMockReply 를 대체. 콜백 시그니처는 동일하게 유지.)
 */

import type { PersonaId } from "./data";

export interface StreamHandlers {
  onMeta?: (meta: { sessionId: string; memoryCount: number; memoryEnabled: boolean }) => void;
  onReasoningDelta?: (delta: string) => void;
  onContentDelta?: (delta: string) => void;
  signal?: AbortSignal;
}

export interface StreamArgs {
  externalId: string;
  sessionId: string | null;
  persona: PersonaId;
  userMessage?: string;
  /** 클라이언트가 부여하는 유저 메시지 id(= DB id) — 이후 편집 타깃팅에 사용 */
  userMessageId?: string;
  /** 마지막 응답 다시 생성 */
  regenerate?: boolean;
  /** 이 유저 메시지를 수정 — 이후를 잘라내고 새 내용으로 재생성 */
  editMessageId?: string;
  /** 음성 모드 — 서버가 짧은 구어체 + 낮은 reasoning effort 로 응답 */
  voice?: boolean;
}

export interface StreamResult {
  content: string;
  reasoning: string;
  sessionId: string | null;
  error?: string;
}

export async function streamReply(
  args: StreamArgs,
  h: StreamHandlers
): Promise<StreamResult> {
  const res = await fetch("/api/counsel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: h.signal,
    body: JSON.stringify({
      externalId: args.externalId,
      sessionId: args.sessionId,
      persona: args.persona,
      userMessage: args.userMessage,
      userMessageId: args.userMessageId,
      regenerate: args.regenerate,
      editMessageId: args.editMessageId,
      voice: args.voice,
    }),
  });

  if (!res.ok || !res.body) {
    let msg = `상담 서버 오류 (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    return { content: "", reasoning: "", sessionId: args.sessionId, error: msg };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoning = "";
  let sessionId = args.sessionId;
  let error: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      let evt: {
        type: string;
        delta?: string;
        sessionId?: string;
        memoryCount?: number;
        memoryEnabled?: boolean;
        message?: string;
      };
      try {
        evt = JSON.parse(t);
      } catch {
        continue;
      }
      switch (evt.type) {
        case "meta":
          sessionId = evt.sessionId ?? sessionId;
          h.onMeta?.({
            sessionId: evt.sessionId ?? "",
            memoryCount: evt.memoryCount ?? 0,
            memoryEnabled: !!evt.memoryEnabled,
          });
          break;
        case "reasoning":
          if (evt.delta) {
            reasoning += evt.delta;
            h.onReasoningDelta?.(evt.delta);
          }
          break;
        case "content":
          if (evt.delta) {
            content += evt.delta;
            h.onContentDelta?.(evt.delta);
          }
          break;
        case "error":
          error = evt.message ?? "생성 중 오류가 발생했습니다.";
          break;
        case "done":
        default:
          break;
      }
    }
  }

  return { content, reasoning, sessionId, error };
}
