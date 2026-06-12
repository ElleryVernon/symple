"use client";

/**
 * 핸즈프리 음성 모드 오버레이 — ChatGPT 모바일 음성모드 스타일.
 *
 * 루프: 듣기(실시간 전사) → 침묵 감지 → LLM 스트림 → 문장 단위 TTS 스트리밍 재생
 *      → 재생 끝나면 다시 듣기. 재생/생성 중 사용자가 말하면 즉시 끊고(barge-in) 듣는다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Mic, MicOff, X } from "lucide-react";
import { Orb, type AgentState } from "@/components/ui/orb";
import { streamReply } from "./stream";
import {
  cleanForSpeech,
  fetchVoiceConfig,
  MicCapture,
  PcmPlayer,
  SentenceChunker,
  SttSocket,
  TtsSocket,
} from "./voice";
import { END_CALL_MARKER, stripControlMarkers } from "@/lib/prompt";
import type { ChatMessage, Persona, PersonaId } from "./data";

/** 통화 종료 마커 제거 + 트림 — 화면/대화 기록에 노출 금지 (공유 스크러버에 위임) */
const stripEndCall = (s: string) => stripControlMarkers(s).trim();

const EASE = [0.16, 1, 0.3, 1] as const;
const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

type VoiceState = "connecting" | "listening" | "thinking" | "speaking" | "error";

const STATUS: Record<VoiceState, string> = {
  connecting: "연결하고 있어요",
  listening: "듣고 있어요",
  thinking: "생각하고 있어요",
  speaking: "말하고 있어요",
  error: "잠깐 문제가 생겼어요",
};

// 끼어들기(barge-in) — 봇이 말하는 동안 마이크 청크(~100ms)의 레벨로 감지한다.
// 임계는 고정값이 아니라 에코/소음 바닥(noise floor)을 학습해 환경에 적응한다:
// 헤드폰(에코 없음)에선 민감하게, 스피커폰(에코 큼)에선 둔감하게.
const BARGE_LEVEL_FLOOR = 0.06; // 적응 임계 하한 — 이보다 민감해지지 않는다
const BARGE_LEVEL_CEIL = 0.2; // 적응 임계 상한 — AGC 걸린 일반 발화(0.1~0.3)가 항상 넘을 수 있는 값
const BARGE_NOISE_FACTOR = 2; // 임계 = 소음 바닥 × 배수
const BARGE_WINDOW = 5; // 판정 윈도(청크 수, ~500ms)
const BARGE_CHUNKS = 3; // 윈도 안에서 임계 초과가 이만큼이면 발화 확정 — 음절 사이 레벨 딥 허용
const BARGE_GRACE_MS = 500; // 봇 음성 시작 직후 — 에코 바닥을 빠르게 학습하는 보정 구간
const PRE_ROLL_CHUNKS = 12; // 끼어든 발화의 시작을 복원할 링버퍼 크기(~1.2s)
const PRE_ONSET_PAD = 2; // 윈도 앞에 함께 복원할 패드 청크(~200ms) — 첫 음절 보호

// 턴 종료 판정 — 전사 타이머 + 실시간 마이크 VAD + 한국어 완결성 휴리스틱 3겹.
// 전사 타이머만 믿으면 STT 지연(수백 ms) 때문에 사용자가 말을 재개했는데도 새 전사가
// 도착하기 전에 타이머가 먼저 터져 "말하는 중에 끊는" 사고가 난다 — 마이크 레벨은
// 지연이 없으므로 제출 직전 음성 활동을 확인해 보류한다. 상담 발화는 생각·감정으로
// 문장 중간에 1초 넘게 멈추는 일이 잦아, 말이 이어질 형태(연결어미)면 더 기다린다.
const FINAL_DEBOUNCE_MS = 400; // 확정 전사 후 기본 대기 — 문장이 완결돼 보일 때
const FINAL_DEBOUNCE_OPEN_MS = 1200; // 연결어미·필러로 끝나 이어질 것 같으면 이만큼 대기
const PARTIAL_RESCUE_MS = 1500; // 확정이 끝내 안 와도 진행 중 전사를 살려 제출 (끝단어 유실 방지)
const VOICE_HOLDOFF_MS = 350; // 이 시간 안에 음성 활동이 있었으면 제출 보류
const VOICE_RECHECK_MS = 150; // 보류 중 재확인 주기
const MAX_VOICE_DEFER_MS = 8000; // 지속 소음에 의한 무한 보류 방지 안전핀

/**
 * 한국어 발화 완결성 휴리스틱 — 연결어미("-고", "-는데")나 접속사·필러("그래서",
 * "음")로 끝나면 말이 이어질 가능성이 높다 → 턴 종료 대기를 늘린다.
 * 오판 비용이 비대칭적이다: 미완을 완결로 보면 말을 끊지만(치명적), 완결을 미완으로
 * 보면 응답이 ~0.8초 늦어질 뿐이다. 의심스러우면 미완 쪽으로 기운다.
 */
const UNFINISHED_TAIL_RE =
  /(?:^|\s)(그리고|그래서|그러니까|그니까|근데|그런데|왜냐하면|아니면|혹시|이제|일단|약간|뭔가|진짜|좀|막|어|음|그)$|[가-힣](?:고|서|며|면|다가|려고|는데|지만|니까|면서|거나|든지|이|가|은|는|을|를|도|에|로|랑|와|한테|에게|부터|까지|보다|처럼|마다)$/;

function looksUnfinished(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/[.?!…]$/.test(t)) return false; // 종결 부호로 끝나면 완결
  if (/[,，]$/.test(t)) return true; // 쉼표 — STT 가 이어짐을 감지한 흔적
  return UNFINISHED_TAIL_RE.test(t);
}

// 무진행 스톨 — LLM/TTS 가 조용히 죽어 thinking/speaking 에 갇히면 턴을 회수하고 듣기로 복귀
const STALL_MS = 12000;

export function VoiceMode({
  persona,
  externalId,
  getSessionId,
  setSessionId,
  onTurn,
  onClose,
}: {
  persona: Persona;
  externalId: string;
  getSessionId: () => string | null;
  setSessionId: (id: string) => void;
  /** assistant 가 null 이면 답변 시작 전(thinking)에 닫힌 턴 — 사용자 발화만 기록 */
  onTurn: (user: ChatMessage, assistant: ChatMessage | null) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<VoiceState>("connecting");
  const [muted, setMuted] = useState(false);
  const [caption, setCaption] = useState(""); // 사용자 실시간 전사
  const [errorMsg, setErrorMsg] = useState("");
  const [retryNonce, setRetryNonce] = useState(0); // 연결 실패 시 '다시 연결' → 파이프라인 재구성

  // 부모(chat)가 인라인 화살표로 콜백을 넘겨 매 렌더마다 identity 가 바뀐다 — 그대로 effect
  // 의존성에 태우면 턴이 끝날 때마다(부모 재렌더) 마이크·STT·TTS 전체가 재연결된다.
  // 항상 ref 로 최신 콜백을 읽어 파이프라인은 오버레이 수명 동안 한 번만 구성한다.
  const propsRef = useRef({ getSessionId, setSessionId, onTurn, onClose });
  useEffect(() => {
    propsRef.current = { getSessionId, setSessionId, onTurn, onClose };
  });

  const stateRef = useRef<VoiceState>("connecting");
  const setVState = (s: VoiceState) => {
    stateRef.current = s;
    setState(s);
  };

  const micRef = useRef<MicCapture | null>(null);
  const sttRef = useRef<SttSocket | null>(null);
  const ttsRef = useRef<TtsSocket | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);

  const utterRef = useRef(""); // 확정(final) 전사 누적
  const partialRef = useRef(""); // 진행 중 부분 전사
  const submitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const turnCtxRef = useRef(""); // 현재 TTS context id
  const speakStartRef = useRef(0); // 답변 음성이 시작된 시각(barge-in grace 용)
  const llmAbortRef = useRef<AbortController | null>(null);
  const assistantBufRef = useRef("");
  const userTextRef = useRef("");
  const thinkStartRef = useRef(0);
  const thinkMsRef = useRef<number | undefined>(undefined);
  const lastProgressRef = useRef(0); // 마지막 진행(LLM 델타/TTS 청크) 시각 — 스톨 감지용
  const endCallRef = useRef(false); // 모델이 통화 종료를 알림 — 작별 인사 재생 후 자동 종료
  const closedRef = useRef(false);

  /* ── 턴 종료(재생 완료) → 메시지 동기화 + 다시 듣기 (또는 모델이 알린 통화 종료) */
  const finishTurn = useCallback(() => {
    if (closedRef.current) return;
    const user = userTextRef.current;
    const assistant = stripEndCall(assistantBufRef.current);
    if (user && assistant) {
      propsRef.current.onTurn(
        { id: uid(), role: "user", content: user },
        { id: uid(), role: "assistant", content: assistant, thinkMs: thinkMsRef.current }
      );
    }
    userTextRef.current = "";
    assistantBufRef.current = "";
    thinkMsRef.current = undefined;
    utterRef.current = "";
    partialRef.current = "";
    setCaption("");
    turnCtxRef.current = ""; // 이후 잔여 chunk/done 무시
    playerRef.current?.reset();
    if (endCallRef.current) {
      // 모델의 작별 인사가 끝까지 재생됐다 — 잠깐의 여운 뒤 음성 모드를 닫는다
      endCallRef.current = false;
      setVState("listening");
      setTimeout(() => {
        if (!closedRef.current) propsRef.current.onClose();
      }, 800);
      return;
    }
    setVState("listening");
  }, []);

  /* ── barge-in: 생성/재생 즉시 중단하고 듣기로 */
  const bargeIn = useCallback(() => {
    endCallRef.current = false; // 작별 인사를 끊고 말을 이어간다 — 자동 종료 취소
    llmAbortRef.current?.abort();
    llmAbortRef.current = null;
    const ctx = turnCtxRef.current;
    turnCtxRef.current = ""; // 먼저 비워 잔여 이벤트를 무시
    if (ctx) ttsRef.current?.cancel(ctx);
    playerRef.current?.stopAll();
    // 끊긴 시점까지의 응답도 대화에 남긴다
    if (userTextRef.current && stripEndCall(assistantBufRef.current)) {
      propsRef.current.onTurn(
        { id: uid(), role: "user", content: userTextRef.current },
        {
          id: uid(),
          role: "assistant",
          content: stripEndCall(assistantBufRef.current),
          thinkMs: thinkMsRef.current,
          interrupted: true,
        }
      );
      userTextRef.current = "";
      assistantBufRef.current = "";
    }
    setCaption(""); // 직전 턴의 전사를 지워 새 발화가 깨끗하게 표시되게
    setVState("listening");
  }, []);

  /* ── 한 턴 실행: LLM 스트림 → 문장 단위 TTS */
  const submitTurn = useCallback(
    async (text: string) => {
      if (closedRef.current || !text.trim()) return;
      userTextRef.current = text.trim();
      assistantBufRef.current = "";
      utterRef.current = "";
      partialRef.current = "";
      setCaption(text.trim());
      setVState("thinking");
      thinkStartRef.current = performance.now();
      lastProgressRef.current = performance.now();
      thinkMsRef.current = undefined;

      const ctxId = `turn-${uid()}`;
      turnCtxRef.current = ctxId;
      endCallRef.current = false;
      const chunker = new SentenceChunker();
      const controller = new AbortController();
      llmAbortRef.current = controller;
      playerRef.current?.reset();

      // hold-back-one: 마지막 문장만 continue:false 로 보내 컨텍스트를 닫는다.
      // (Cartesia 는 빈 transcript 로 닫을 수 없어, 직전 문장을 보류했다가 마지막에 마감)
      // pending 에는 cleanForSpeech 를 통과한 비어있지 않은 문장만 들어간다 — 마커/지시문
      // 단독 문장이 보류 슬롯을 차지하면 마지막 continue:false 가 빈값이 되어 컨텍스트가
      // 영영 안 닫히고(done 미수신) 턴이 스톨 워치독까지 매달린다.
      let pending = "";
      let sentAny = false;
      const flushPending = () => {
        if (!pending) return;
        // speak 가 false 면 소켓이 죽어 버려진 것 — sentAny 로 잡아 무한 thinking 을 막는다
        if (ttsRef.current?.speak(ctxId, pending, false)) sentAny = true; // continue:true
        pending = "";
      };

      try {
        const result = await streamReply(
          {
            externalId,
            sessionId: propsRef.current.getSessionId(),
            persona: persona.id as PersonaId,
            userMessage: userTextRef.current,
            voice: true,
          },
          {
            onMeta: ({ sessionId }) => {
              if (sessionId) propsRef.current.setSessionId(sessionId);
            },
            onContentDelta: (d) => {
              if (turnCtxRef.current !== ctxId) return; // 끊긴 턴
              if (thinkMsRef.current === undefined)
                thinkMsRef.current = performance.now() - thinkStartRef.current;
              lastProgressRef.current = performance.now();
              assistantBufRef.current += d;
              // 새 문장이 완성되면, 직전 문장을 continue:true 로 내보내고 새 문장을 보류
              for (const s of chunker.push(d)) {
                const clean = cleanForSpeech(s);
                if (!clean) continue; // 지시문/마커 단독 문장 — 보류 슬롯을 오염시키지 않는다
                flushPending();
                pending = clean;
              }
            },
            signal: controller.signal,
          }
        );
        if (turnCtxRef.current !== ctxId) return;
        if (result.error) {
          // 실패 턴 정리 — 부분 응답이 있으면(서버도 저장함) 대화에 남기고, 시작 전
          // 거절(429/400 등, 서버 미저장)이면 통째로 버린다. 어느 쪽이든 ref 를 비워
          // 오버레이 닫기 시 cleanup 회수가 DB 에 없는 메시지를 만들지 않게 한다.
          const partial = stripEndCall(assistantBufRef.current);
          if (userTextRef.current && partial) {
            propsRef.current.onTurn(
              { id: uid(), role: "user", content: userTextRef.current },
              {
                id: uid(),
                role: "assistant",
                content: partial,
                thinkMs: thinkMsRef.current,
                interrupted: true,
              }
            );
          }
          userTextRef.current = "";
          assistantBufRef.current = "";
          setErrorMsg(result.error);
          setVState("error");
          setTimeout(() => {
            if (!closedRef.current && stateRef.current === "error") setVState("listening");
          }, 2500);
          return;
        }
        // 모델이 통화 종료를 알렸는지 — 마커는 화면/기록에서 제거되고,
        // 작별 인사 재생이 끝나면(finishTurn) 음성 모드가 자동으로 닫힌다
        if (assistantBufRef.current.includes(END_CALL_MARKER)) {
          endCallRef.current = true;
          assistantBufRef.current = stripEndCall(assistantBufRef.current);
        }
        // 보류 문장 + 남은 텍스트를 합쳐 마지막 청크로 컨텍스트 종료(continue:false).
        // pending 은 이미 클린·비어있지 않으므로, 한 문장이라도 보냈다면 닫기가 보장된다.
        const rest = cleanForSpeech(chunker.flush());
        const finalText = `${pending}${rest ? (pending ? " " : "") + rest : ""}`;
        if (finalText && ttsRef.current?.speak(ctxId, finalText, true)) sentAny = true;
        // 빈 응답이거나 TTS 소켓이 죽어 한 글자도 못 보냈으면 즉시 턴을 마감(무한 thinking 방지)
        if (!sentAny) finishTurn();
      } catch {
        if (turnCtxRef.current === ctxId && !closedRef.current) setVState("listening");
      }
    },
    [externalId, persona.id, finishTurn]
  );

  /* ── 마운트: 연결 + 핸즈프리 루프 시작 */
  useEffect(() => {
    closedRef.current = false;
    let disposed = false;
    let watchdog: ReturnType<typeof setInterval> | null = null;

    // 핸즈프리 중 화면이 잠기면 마이크/재생 컨텍스트가 통째로 멈춘다 — 화면 꺼짐 방지
    let wakeLock: WakeLockSentinel | null = null;
    const acquireWakeLock = async () => {
      try {
        if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request("screen");
      } catch {
        /* 미지원/저전력 모드 — 무시 */
      }
    };
    const onVisibility = () => {
      // 백그라운드를 다녀오면 wake lock 이 해제되고 AudioContext 가 suspend 될 수 있다
      if (document.visibilityState === "visible") {
        void acquireWakeLock();
        void micRef.current?.resume();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    (async () => {
      try {
        void acquireWakeLock();
        let cfg = await fetchVoiceConfig();
        if (disposed) return;

        const player = new PcmPlayer(cfg.tts.sampleRate);
        playerRef.current = player;
        player.onDrain = () => finishTurn();

        // 생성/재생 중 파이프라인이 죽었을 때 — 받은 데까지 대화에 남기고 듣기로 복귀
        const salvageTurn = () => {
          if (disposed || closedRef.current) return;
          const st = stateRef.current;
          if (st !== "thinking" && st !== "speaking") return;
          llmAbortRef.current?.abort();
          const ctx = turnCtxRef.current;
          turnCtxRef.current = "";
          if (ctx) ttsRef.current?.cancel(ctx);
          playerRef.current?.stopAll();
          finishTurn();
        };

        // TTS 도 STT 와 같은 생존성 — 소켓이 닫히면 진행 중 턴을 회수하고 재연결한다.
        // (이전엔 TTS 가 죽으면 speak 가 조용히 버려져 '생각하고 있어요'에 영원히 갇혔다)
        const onTtsChunk = (b64: string, ctx: string) => {
          if (ctx !== turnCtxRef.current) return; // 취소된 컨텍스트의 잔여 오디오 무시
          lastProgressRef.current = performance.now();
          if (stateRef.current === "thinking") {
            speakStartRef.current = performance.now(); // grace 시작
            setVState("speaking");
          }
          player.enqueueBase64(b64);
        };
        const onTtsDone = (ctx: string) => {
          if (ctx === turnCtxRef.current) player.markEnd();
        };
        const onTtsError = (msg: string) => {
          // barge-in 으로 이미 종료/취소/닫힌 컨텍스트를 건드릴 때 나는 정상 잡음 → 무시
          if (/context/i.test(msg) && /(exist|cancel|clos)/i.test(msg)) return;
          console.error("[voice] tts:", msg);
        };
        const connectTts = async () => {
          const tts = new TtsSocket();
          ttsRef.current = tts;
          await tts.connect(cfg, onTtsChunk, onTtsDone, onTtsError, () => {
            if (disposed || closedRef.current) return;
            salvageTurn(); // 진행 중이던 턴의 오디오는 더 못 받는다 — 즉시 회수
            void reconnectTts();
          });
          if (disposed || closedRef.current) tts.close(); // 연결 완료가 언마운트보다 늦었다
        };

        // STT 는 죽어도 UI 는 '듣고 있어요'로 남고(sendAudio 가 조용히 버림), TTS 는
        // speak 가 조용히 버린다 — 닫히면 즉시 재연결, 실패 시 새 토큰으로 1회 재시도.
        // 재연결 정책은 STT/TTS 가 공유한다(드리프트 방지). 모든 await 뒤에서 disposed 를
        // 재확인해, 언마운트 중의 재연결이 고아 소켓·불필요한 토큰 발급을 만들지 않는다.
        const makeReconnector = (
          label: string,
          closeCurrent: () => void,
          connect: () => Promise<void>
        ) => {
          let busy = false;
          return async () => {
            if (busy || disposed || closedRef.current) return;
            busy = true;
            closeCurrent();
            try {
              try {
                await connect();
              } catch {
                cfg = await fetchVoiceConfig(); // 토큰 만료 가능성 → 새 토큰으로 재시도
                if (disposed || closedRef.current) return; // 언마운트 중 — 새 소켓 금지
                await connect();
              }
            } catch (e) {
              console.error(`[voice] ${label} reconnect failed:`, e);
            } finally {
              busy = false;
            }
          };
        };
        const reconnectTts = makeReconnector("tts", () => ttsRef.current?.close(), connectTts);

        const connectStt = async () => {
          const stt = new SttSocket();
          sttRef.current = stt;
          await stt.connect(cfg, sttEvents);
          if (disposed || closedRef.current) stt.close(); // 연결 완료가 언마운트보다 늦었다
        };
        const reconnectStt = makeReconnector("stt", () => sttRef.current?.close(), connectStt);

        // 실시간 음성 활동(VAD) — 전사보다 수백 ms 빠른 신호. 제출 직전에 확인해
        // 사용자가 아직 말하는 중이면 제출을 미룬다(전사가 곧 도착해 타이머를 리셋한다).
        let lastVoiceAt = 0;
        let listenFloor = 0.015; // 듣기 상태의 주변 소음 바닥(EMA) — 임계의 기준점

        const scheduleSubmit = (delay: number) => {
          if (submitTimer.current) clearTimeout(submitTimer.current);
          const armedAt = performance.now();
          const tick = () => {
            if (stateRef.current !== "listening") return;
            const sinceVoice = performance.now() - lastVoiceAt;
            if (
              sinceVoice < VOICE_HOLDOFF_MS &&
              performance.now() - armedAt < MAX_VOICE_DEFER_MS
            ) {
              submitTimer.current = setTimeout(tick, VOICE_RECHECK_MS);
              return;
            }
            const turnText = `${utterRef.current} ${partialRef.current}`.trim();
            if (turnText) void submitTurn(turnText);
          };
          submitTimer.current = setTimeout(tick, delay);
        };

        const sttEvents = {
          onClose: () => {
            if (!disposed && !closedRef.current) void reconnectStt();
          },
          onTranscript: (text: string, isFinal: boolean) => {
            if (disposed || !text.trim()) return;
            // 봇 턴(thinking/speaking) 중 STT 는 무음만 받으므로, 이때 도착하는 전사는
            // 상태 전환 직전 오디오의 잔여물뿐 — 입력으로 캡처하지 않고 버린다.
            // (끼어들기 감지는 마이크 청크 레벨 기반 — mic.start 콜백 참조)
            if (stateRef.current !== "listening") return;
            if (isFinal) {
              utterRef.current = `${utterRef.current} ${text}`.trim();
              partialRef.current = "";
            } else {
              partialRef.current = text;
            }
            setCaption(`${utterRef.current} ${partialRef.current}`.trim());
            // 침묵 디바운스로 턴 종료를 판정한다. 매 전사마다 타이머가 리셋되고,
            // 제출 직전엔 마이크 VAD 가 한 번 더 막는다(scheduleSubmit).
            // 확정 직후 기본은 짧게(저지연), 단 발화가 연결어미·필러로 끝나
            // 이어질 형태면 길게, 부분만 있을 땐 가장 길게(확정 유실 구제) 기다린다.
            if (submitTimer.current) clearTimeout(submitTimer.current);
            const pending = `${utterRef.current} ${partialRef.current}`.trim();
            if (pending) {
              const delay = isFinal
                ? looksUnfinished(pending)
                  ? FINAL_DEBOUNCE_OPEN_MS
                  : FINAL_DEBOUNCE_MS
                : PARTIAL_RESCUE_MS;
              scheduleSubmit(delay);
            }
          },
          onError: (msg: string) => console.error("[voice] stt:", msg),
        };
        await Promise.all([connectTts(), connectStt()]);

        // ── 끼어들기 감지 + 발화 시작(onset) 복원 — 마이크 청크(~100ms) 경로에서 처리.
        //
        // 봇 턴(thinking/speaking) 동안 STT 엔 무음을 보내 에코 백로그를 차단하되,
        // 실제 청크는 링버퍼(pre-roll)에 보관한다. 최근 윈도(~500ms) 안에서 적응
        // 임계(학습된 에코/소음 바닥 × 배수)를 넘는 청크가 과반이면 발화로 확정하고:
        // 재생을 페이드아웃 → 버퍼에서 발화 시작부(윈도 + 직전 패드)를 STT 로
        // 밀어넣어 끼어든 말의 첫 음절까지 전사에 살린다.
        // (연속 스트릭 방식은 음절 사이의 짧은 레벨 딥에 매번 리셋돼 트리거가 안 된다)
        let preRoll: { chunk: ArrayBuffer; level: number }[] = [];
        let noiseFloor = 0.02; // 봇 턴 중 학습되는 에코/소음 바닥 — 턴/세션에 걸쳐 유지
        let graceMin = Infinity; // grace 구간의 최저 레벨 — 겹친 발화 속에서도 에코 바닥을 찾는다
        let silence: ArrayBuffer | null = null; // 무음 청크 재사용(send 가 복사하므로 안전)
        const mic = new MicCapture();
        micRef.current = mic;
        await mic.start((chunk, level) => {
          // 재연결 후에도 항상 현재 소켓으로 — 지역변수 캡처 금지.
          const s = sttRef.current;
          if (!s) return;
          const st = stateRef.current;
          if (st !== "speaking" && st !== "thinking") {
            preRoll = [];
            graceMin = Infinity;
            s.sendAudio(chunk);
            // 듣기 중 음성 활동 추적 — 소음 바닥 위로 올라온 청크를 발화로 본다.
            // 바닥은 비발화 청크에서만 학습(천천히 올리고 빠르게 내림)해 발화를 쫓지 않는다.
            const vadThreshold = Math.min(Math.max(listenFloor * 2.5, 0.04), 0.15);
            if (level >= vadThreshold) lastVoiceAt = performance.now();
            else listenFloor += (level - listenFloor) * (level > listenFloor ? 0.05 : 0.3);
            return;
          }

          // 봇 턴 — 에코 차단(무음 전송) + 실제 오디오는 링버퍼에 보관
          if (!silence || silence.byteLength !== chunk.byteLength)
            silence = new ArrayBuffer(chunk.byteLength);
          s.sendAudio(silence);
          preRoll.push({ chunk, level });
          if (preRoll.length > PRE_ROLL_CHUNKS) preRoll.shift();

          const inGrace =
            st === "speaking" && performance.now() - speakStartRef.current <= BARGE_GRACE_MS;
          const threshold = Math.min(
            Math.max(noiseFloor * BARGE_NOISE_FACTOR, BARGE_LEVEL_FLOOR),
            BARGE_LEVEL_CEIL
          );
          // 에코/소음 바닥 학습.
          // grace(봇 음성 시작 직후): 구간 '최저' 레벨로 수렴 — 에코는 연속적이고 발화는
          // 음절 사이가 꺼지므로, 사용자가 겹쳐 말해도 최저값은 에코 바닥에 가깝다.
          // (평균으로 배우면 겹친 발화가 바닥을 부풀려 그 턴의 끼어들기가 죽는다)
          // 이후: 비발화 청크에서만 천천히 올리고 빠르게 내린다 — 임계가 발화를 쫓지 않게.
          if (inGrace) {
            graceMin = Math.min(graceMin, level);
            noiseFloor += (graceMin - noiseFloor) * 0.4;
            return;
          }
          if (level < threshold)
            noiseFloor += (level - noiseFloor) * (level > noiseFloor ? 0.05 : 0.3);

          // 윈도 투표 — 현재 청크가 크고, 최근 5청크 중 3청크가 임계를 넘으면 발화 확정
          const recent = preRoll.slice(-BARGE_WINDOW);
          const loud = recent.filter((p) => p.level >= threshold).length;
          if (level < threshold || loud < BARGE_CHUNKS) return;

          // 끼어들기 확정 — 페이드아웃으로 끊고, 버퍼의 발화 시작부를 STT 로 복원
          const onset = preRoll.slice(-(BARGE_WINDOW + PRE_ONSET_PAD)).map((p) => p.chunk);
          preRoll = [];
          bargeIn();
          for (const c of onset) sttRef.current?.sendAudio(c);
        });

        // 워치독 — 조용히 죽는 모든 경로를 감시·복구:
        // STT/TTS 소켓 사망 → 재연결, AudioContext suspend(모바일) → 재개,
        // thinking/speaking 무진행 스톨 → 턴 회수 후 듣기 복귀.
        watchdog = setInterval(() => {
          if (disposed || closedRef.current) return;
          void micRef.current?.resume();
          if (!sttRef.current?.isOpen) void reconnectStt();
          if (!ttsRef.current?.isOpen) void reconnectTts();
          const st = stateRef.current;
          if (
            (st === "thinking" || st === "speaking") &&
            !playerRef.current?.playing &&
            performance.now() - lastProgressRef.current > STALL_MS
          ) {
            console.error("[voice] turn stalled — salvaging");
            salvageTurn();
          }
        }, 2000);

        if (!disposed) setVState("listening");
      } catch (e) {
        if (!disposed) {
          setErrorMsg((e as Error).message ?? "음성 연결에 실패했어요.");
          setVState("error");
        }
      }
    })();

    return () => {
      disposed = true;
      closedRef.current = true;
      // 진행 중이던 턴 회수 — 재생/생성 중에 닫아도 받은 데까지 대화에 남긴다.
      // (서버는 같은 턴을 이미 저장하므로, 여기서 안 남기면 새로고침 전까지
      //  텍스트 모드에 마지막 교환이 보이지 않는 불일치가 생긴다)
      if (userTextRef.current) {
        const salvaged = stripEndCall(assistantBufRef.current);
        propsRef.current.onTurn(
          { id: uid(), role: "user", content: userTextRef.current },
          salvaged
            ? {
                id: uid(),
                role: "assistant",
                content: salvaged,
                thinkMs: thinkMsRef.current,
                interrupted: true,
              }
            : null
        );
        userTextRef.current = "";
        assistantBufRef.current = "";
      }
      document.removeEventListener("visibilitychange", onVisibility);
      void wakeLock?.release().catch(() => {});
      if (watchdog) clearInterval(watchdog);
      if (submitTimer.current) clearTimeout(submitTimer.current);
      llmAbortRef.current?.abort();
      micRef.current?.stop();
      sttRef.current?.close();
      ttsRef.current?.close();
      void playerRef.current?.destroy();
    };
  }, [bargeIn, finishTurn, submitTurn, retryNonce]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (micRef.current) micRef.current.muted = next;
  };

  const agentState: AgentState =
    state === "listening"
      ? "listening"
      : state === "thinking"
        ? "thinking"
        : state === "speaking"
          ? "talking"
          : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
      className="fixed inset-0 z-50 flex flex-col bg-bg text-ink"
      role="dialog"
      aria-label="음성 상담"
    >
      {/* 상단 */}
      <div className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),1.25rem)]">
        <div className="flex items-center gap-2">
          <div
            className="h-7 w-7 overflow-hidden rounded-full"
            style={{ background: "var(--accent-soft)" }}
          >
            <video src={persona.video} autoPlay loop muted playsInline className="h-full w-full object-cover" />
          </div>
          <span className="text-[0.9rem] font-bold text-ink-soft">{persona.character}</span>
        </div>
        <button
          onClick={onClose}
          aria-label="음성 모드 종료"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/[0.05] text-ink-soft transition-colors hover:text-ink"
        >
          <X size={18} />
        </button>
      </div>

      {/* 중앙: ElevenLabs agent orb (마이크/TTS 진폭에 실시간 반응) */}
      <div className="flex flex-1 flex-col items-center justify-center gap-9 px-6">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="relative"
        >
          {/* 토스식 부드러운 코랄 글로우 */}
          <div
            className="pointer-events-none absolute inset-0 -z-10 scale-[1.4] rounded-full opacity-70 blur-3xl"
            style={{ background: "var(--accent-soft)" }}
          />
          <div className="h-64 w-64 sm:h-72 sm:w-72">
            <Orb
              colors={["#FFC9C9", "#FA5454"]}
              agentState={agentState}
              volumeMode="manual"
              getInputVolume={() => micRef.current?.getLevel() ?? 0}
              getOutputVolume={() => playerRef.current?.getLevel() ?? 0}
            />
          </div>
        </motion.div>

        {/* 상태 + 전사 */}
        <div className="flex min-h-[6.5rem] max-w-sm flex-col items-center gap-3 text-center">
          {state === "thinking" ? (
            <span className="shimmer-text text-[1.4rem] font-bold">생각하고 있어요</span>
          ) : state === "error" ? (
            <div className="flex flex-col items-center gap-3">
              <span className="text-[1.15rem] font-bold" style={{ color: "var(--accent-strong)" }}>
                {errorMsg || STATUS.error}
              </span>
              <button
                onClick={() => {
                  setErrorMsg("");
                  setVState("connecting");
                  setRetryNonce((n) => n + 1); // effect 재실행 → 파이프라인 전체 재구성
                }}
                className="rounded-full bg-ink/[0.06] px-5 py-2.5 text-[0.92rem] font-bold text-ink transition-colors hover:bg-ink/[0.1]"
              >
                다시 연결
              </button>
            </div>
          ) : STATUS[state] ? (
            <span className="text-[1.4rem] font-bold text-ink">{STATUS[state]}</span>
          ) : null}
          <AnimatePresence mode="popLayout">
            {caption ? (
              <motion.p
                key={caption}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 26 }}
                className="balance text-[1.02rem] leading-relaxed text-ink-soft"
              >
                {caption}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* 하단 컨트롤 — 토스식 라벨 버튼 */}
      <div className="flex items-end justify-center gap-12 pb-[max(env(safe-area-inset-bottom),2.5rem)]">
        <button
          onClick={toggleMute}
          aria-label={muted ? "마이크 켜기" : "마이크 끄기"}
          className="flex flex-col items-center gap-2.5"
        >
          <span
            className={`flex h-16 w-16 items-center justify-center rounded-full transition-all active:scale-95 ${
              muted ? "bg-ink text-white" : "bg-ink/[0.05] text-ink-soft hover:bg-ink/[0.08]"
            }`}
          >
            {muted ? <MicOff size={24} /> : <Mic size={24} />}
          </span>
          <span className="text-[0.78rem] font-semibold text-ink-faint">
            {muted ? "음소거됨" : "마이크"}
          </span>
        </button>
        <button onClick={onClose} aria-label="음성 모드 종료" className="flex flex-col items-center gap-2.5">
          <span
            className="flex h-16 w-16 items-center justify-center rounded-full text-white transition-transform active:scale-95"
            style={{ background: "var(--accent-strong)" }}
          >
            <X size={24} />
          </span>
          <span className="text-[0.78rem] font-semibold text-ink-faint">종료</span>
        </button>
      </div>
    </motion.div>
  );
}
