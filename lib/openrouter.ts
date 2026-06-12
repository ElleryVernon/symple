/**
 * OpenRouter 스트리밍 클라이언트.
 * SSE 청크를 파싱해 reasoning / content 델타를 순서대로 yield 한다.
 */

export type ChatMsg =
  | {
      role: "system" | "user";
      content: string;
    }
  | {
      role: "assistant";
      content: string | null;
    };

export type StreamDelta =
  | { type: "reasoning"; text: string }
  | { type: "content"; text: string };

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export interface StreamChatOptions {
  /** reasoning 강도 오버라이드 — 음성 모드는 첫 토큰 지연을 줄이기 위해 low 사용 */
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
}

function envFlag(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export const reasoningEnabled = () => envFlag("OPENROUTER_REASONING_ENABLED", false);

// 회복력 — 첫 토큰이 나오기 전까지는 안전하게 재시도할 수 있다(중복 출력 없음).
// 첫 토큰 이후의 오류는 그대로 전파한다(이미 내보낸 내용과 중복 생성 위험).
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;
const FIRST_TOKEN_TIMEOUT_MS = 12_000;

class NonRetryableError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * LLM 스트리밍 — 일시 장애(429/5xx/네트워크/응답 행)에 첫 토큰 전 한정 재시도.
 * OPENROUTER_FALLBACK_MODELS(쉼표 구분)가 있으면 OpenRouter 의 네이티브 모델
 * 폴백 라우팅(models 배열)으로 1차 모델 장애 시 자동 우회한다.
 */
export async function* streamChat(
  messages: ChatMsg[],
  signal?: AbortSignal,
  opts?: StreamChatOptions
): AsyncGenerator<StreamDelta> {
  let lastError: unknown;
  let yielded = false; // 토큰을 하나라도 내보냈는가 — 이후의 재시도는 중복 출력이 된다
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) throw lastError ?? new Error("aborted");
    if (attempt > 0) await sleep(RETRY_BASE_DELAY_MS * attempt);

    // 시도별 컨트롤러 — 첫 토큰 타임아웃 시 이 시도만 끊고 재시도한다
    const attemptController = new AbortController();
    const attemptSignal = signal
      ? AbortSignal.any([signal, attemptController.signal])
      : attemptController.signal;

    try {
      const it = streamChatOnce(messages, attemptSignal, opts)[Symbol.asyncIterator]();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const first = await Promise.race([
        it.next(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            attemptController.abort();
            reject(new Error("첫 토큰 타임아웃"));
          }, FIRST_TOKEN_TIMEOUT_MS);
        }),
      ]).finally(() => clearTimeout(timer));

      if (first.done) throw new Error("빈 응답"); // 토큰 없이 종료 → 재시도
      yielded = true;
      yield first.value;
      // 첫 토큰 이후 — 재시도 없이 그대로 통과
      while (true) {
        const next = await it.next();
        if (next.done) return;
        yield next.value;
      }
    } catch (e) {
      lastError = e;
      // 이미 내보낸 토큰이 있으면 재시도 금지 — 같은 답변이 처음부터 다시 흘러
      // 화면·DB·기억에 본문이 중복 저장된다. 그대로 표면화한다.
      if (yielded || signal?.aborted || e instanceof NonRetryableError) throw e;
      console.error(`[openrouter] attempt ${attempt + 1}/${MAX_ATTEMPTS} failed:`, e);
    }
  }
  throw lastError;
}

export interface CompleteOnceOptions {
  /** 분류기 등 보조 작업용 모델 — 미지정 시 메인 모델 */
  model?: string;
  signal?: AbortSignal;
  maxTokens?: number;
  /** JSON 객체 응답 강제 (response_format) */
  json?: boolean;
}

/**
 * 비스트리밍 1회 완성 — 시나리오 분류기 같은 짧은 보조 호출용.
 * 상담 본문 스트리밍과 달리 실패가 치명적이지 않으므로 재시도 없이 표면화한다
 * (호출부가 null 처리 후 다음 턴에 자연 재시도).
 */
export async function completeOnce(
  messages: ChatMsg[],
  opts?: CompleteOnceOptions
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new NonRetryableError("OPENROUTER_API_KEY 가 설정되지 않았습니다.");
  const model =
    opts?.model || process.env.OPENROUTER_MODEL?.trim() || "mistralai/ministral-14b-2512";

  const res = await fetch(ENDPOINT, {
    method: "POST",
    signal: opts?.signal,
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
      // 분류는 지연이 곧 비용 — reasoning 을 명시적으로 끈다
      reasoning: { enabled: false },
      ...(opts?.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 400)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return json?.choices?.[0]?.message?.content ?? "";
}

async function* streamChatOnce(
  messages: ChatMsg[],
  signal: AbortSignal | undefined,
  opts?: StreamChatOptions
): AsyncGenerator<StreamDelta> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new NonRetryableError("OPENROUTER_API_KEY 가 설정되지 않았습니다.");

  const model = process.env.OPENROUTER_MODEL?.trim() || "mistralai/ministral-14b-2512";
  const fallbacks = (process.env.OPENROUTER_FALLBACK_MODELS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
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
      // models 배열이 있으면 OpenRouter 가 1차 모델 장애/포화 시 순서대로 우회한다
      ...(fallbacks.length ? { models: [model, ...fallbacks] } : { model }),
      messages,
      stream: true,
      // 폭주 가드 — 상담 답변(2~5문장 + reasoning)은 이 한도에 닿을 일이 없고,
      // 모델이 반복 루프에 빠졌을 때만 동작한다(없으면 90초 타임아웃까지 무한 생성).
      max_tokens: Number(process.env.OPENROUTER_MAX_TOKENS) || 4096,
      ...(reasoningEnabled() ? { reasoning: { effort } } : {}),
    }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    const message = `OpenRouter ${res.status}: ${errText.slice(0, 400)}`;
    // 401/402/403/400 은 재시도해도 같은 결과 — 즉시 표면화
    if ([400, 401, 402, 403, 404].includes(res.status)) throw new NonRetryableError(message);
    throw new Error(message);
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
