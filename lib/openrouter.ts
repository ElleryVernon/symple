/**
 * OpenRouter 스트리밍 클라이언트 — Gemini 3.5 Flash (reasoning effort medium).
 * SSE 청크를 파싱해 reasoning / content 델타를 순서대로 yield 한다.
 */

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

export type StreamDelta =
  | { type: "reasoning"; text: string }
  | { type: "content"; text: string };

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export interface StreamChatOptions {
  /** reasoning 강도 오버라이드 — 음성 모드는 첫 토큰 지연을 줄이기 위해 low 사용 */
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
}

export async function* streamChat(
  messages: ChatMsg[],
  signal?: AbortSignal,
  opts?: StreamChatOptions
): AsyncGenerator<StreamDelta> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY 가 설정되지 않았습니다.");

  const model = process.env.OPENROUTER_MODEL?.trim() || "google/gemini-3.5-flash";
  const effort = (opts?.reasoningEffort ||
    process.env.OPENROUTER_REASONING_EFFORT?.trim() ||
    "medium") as "minimal" | "low" | "medium" | "high";

  const res = await fetch(ENDPOINT, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(process.env.OPENROUTER_APP_URL
        ? { "HTTP-Referer": process.env.OPENROUTER_APP_URL }
        : {}),
      ...(process.env.OPENROUTER_APP_TITLE
        ? { "X-Title": process.env.OPENROUTER_APP_TITLE }
        : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      reasoning: { effort },
    }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 400)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE 는 줄 단위 — 완성된 줄만 처리하고 마지막 부분 줄은 버퍼에 남긴다.
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith(":")) continue; // 빈 줄 / SSE 주석(keep-alive)
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        const delta = json?.choices?.[0]?.delta;
        if (!delta) continue;
        // OpenRouter 는 reasoning 모델의 생각을 delta.reasoning(문자열)으로 정규화해 보낸다.
        if (typeof delta.reasoning === "string" && delta.reasoning.length) {
          yield { type: "reasoning", text: delta.reasoning };
        }
        if (typeof delta.content === "string" && delta.content.length) {
          yield { type: "content", text: delta.content };
        }
      } catch {
        /* 부분 JSON — 다음 청크에서 이어 처리 */
      }
    }
  }
}
