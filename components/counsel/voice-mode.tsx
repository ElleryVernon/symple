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
  fetchVoiceConfig,
  MicCapture,
  PcmPlayer,
  SentenceChunker,
  SttSocket,
  TtsSocket,
} from "./voice";
import type { ChatMessage, Persona, PersonaId } from "./data";

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
  onTurn: (user: ChatMessage, assistant: ChatMessage) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<VoiceState>("connecting");
  const [muted, setMuted] = useState(false);
  const [caption, setCaption] = useState(""); // 사용자 실시간 전사
  const [errorMsg, setErrorMsg] = useState("");

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
  const llmAbortRef = useRef<AbortController | null>(null);
  const assistantBufRef = useRef("");
  const userTextRef = useRef("");
  const thinkStartRef = useRef(0);
  const thinkMsRef = useRef<number | undefined>(undefined);
  const closedRef = useRef(false);

  /* ── 턴 종료(재생 완료) → 메시지 동기화 + 다시 듣기 */
  const finishTurn = useCallback(() => {
    if (closedRef.current) return;
    const user = userTextRef.current;
    const assistant = assistantBufRef.current;
    if (user && assistant) {
      onTurn(
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
    playerRef.current?.reset();
    setVState("listening");
  }, [onTurn]);

  /* ── barge-in: 생성/재생 즉시 중단하고 듣기로 */
  const bargeIn = useCallback(() => {
    llmAbortRef.current?.abort();
    llmAbortRef.current = null;
    if (turnCtxRef.current) ttsRef.current?.cancel(turnCtxRef.current);
    playerRef.current?.stopAll();
    // 끊긴 시점까지의 응답도 대화에 남긴다
    if (userTextRef.current && assistantBufRef.current) {
      onTurn(
        { id: uid(), role: "user", content: userTextRef.current },
        {
          id: uid(),
          role: "assistant",
          content: assistantBufRef.current,
          thinkMs: thinkMsRef.current,
          interrupted: true,
        }
      );
      userTextRef.current = "";
      assistantBufRef.current = "";
    }
    setVState("listening");
  }, [onTurn]);

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
      thinkMsRef.current = undefined;

      const ctxId = `turn-${uid()}`;
      turnCtxRef.current = ctxId;
      const chunker = new SentenceChunker();
      let sentAny = false;
      const controller = new AbortController();
      llmAbortRef.current = controller;
      playerRef.current?.reset();

      const speak = (sentence: string, final: boolean) => {
        if (!sentence && !sentAny) return;
        ttsRef.current?.speak(ctxId, sentence, sentAny, final);
        sentAny = true;
      };

      try {
        const result = await streamReply(
          {
            externalId,
            sessionId: getSessionId(),
            persona: persona.id as PersonaId,
            userMessage: userTextRef.current,
            voice: true,
          },
          {
            onMeta: ({ sessionId }) => {
              if (sessionId) setSessionId(sessionId);
            },
            onContentDelta: (d) => {
              if (turnCtxRef.current !== ctxId) return; // 끊긴 턴
              if (thinkMsRef.current === undefined)
                thinkMsRef.current = performance.now() - thinkStartRef.current;
              assistantBufRef.current += d;
              for (const s of chunker.push(d)) speak(s, false);
            },
            signal: controller.signal,
          }
        );
        if (turnCtxRef.current !== ctxId) return;
        if (result.error) {
          setErrorMsg(result.error);
          setVState("error");
          setTimeout(() => {
            if (!closedRef.current && stateRef.current === "error") setVState("listening");
          }, 2500);
          return;
        }
        // 남은 텍스트로 컨텍스트 종료(continue:false)
        const rest = chunker.flush();
        if (rest || sentAny) speak(rest, true);
        if (!sentAny) finishTurn(); // 빈 응답 안전망
      } catch {
        if (turnCtxRef.current === ctxId && !closedRef.current) setVState("listening");
      }
    },
    [externalId, getSessionId, persona.id, setSessionId, finishTurn]
  );

  /* ── 마운트: 연결 + 핸즈프리 루프 시작 */
  useEffect(() => {
    closedRef.current = false;
    let disposed = false;

    (async () => {
      try {
        const cfg = await fetchVoiceConfig();
        if (disposed) return;

        const player = new PcmPlayer(cfg.tts.sampleRate);
        playerRef.current = player;
        player.onDrain = () => finishTurn();

        const tts = new TtsSocket();
        ttsRef.current = tts;
        await tts.connect(
          cfg,
          (b64, ctx) => {
            if (ctx !== turnCtxRef.current) return; // 취소된 컨텍스트의 잔여 오디오 무시
            if (stateRef.current === "thinking") setVState("speaking");
            player.enqueueBase64(b64);
          },
          (ctx) => {
            if (ctx === turnCtxRef.current) player.markEnd();
          },
          (msg) => console.error("[voice] tts:", msg)
        );

        const stt = new SttSocket();
        sttRef.current = stt;
        await stt.connect(cfg, {
          onTranscript: (text, isFinal) => {
            if (disposed || !text.trim()) return;
            // 응답 생성/재생 중 발화 → barge-in
            if (stateRef.current === "speaking" || stateRef.current === "thinking") {
              bargeIn();
            }
            if (stateRef.current !== "listening") return;
            if (isFinal) {
              utterRef.current = `${utterRef.current} ${text}`.trim();
              partialRef.current = "";
            } else {
              partialRef.current = text;
            }
            setCaption(`${utterRef.current} ${partialRef.current}`.trim());
            // 침묵 디바운스 — final 후 잠깐 더 기다렸다 턴 제출
            if (submitTimer.current) clearTimeout(submitTimer.current);
            if (isFinal && utterRef.current) {
              submitTimer.current = setTimeout(() => {
                if (stateRef.current === "listening") void submitTurn(utterRef.current);
              }, 550);
            }
          },
          onError: (msg) => console.error("[voice] stt:", msg),
        });

        const mic = new MicCapture();
        micRef.current = mic;
        await mic.start((chunk) => stt.sendAudio(chunk));

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
      if (submitTimer.current) clearTimeout(submitTimer.current);
      llmAbortRef.current?.abort();
      micRef.current?.stop();
      sttRef.current?.close();
      ttsRef.current?.close();
      void playerRef.current?.destroy();
    };
  }, [bargeIn, finishTurn, submitTurn]);

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
            <span className="text-[1.15rem] font-bold" style={{ color: "var(--accent-strong)" }}>
              {errorMsg || STATUS.error}
            </span>
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
