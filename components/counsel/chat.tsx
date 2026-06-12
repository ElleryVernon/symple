"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, ArrowDown, Square, ChevronDown, Mic, Trash2, X } from "lucide-react";
import { Streamdown } from "streamdown";
import { Logo } from "../ui";
import { stripControlMarkers } from "@/lib/prompt";
import { streamReply } from "./stream";
import { VoiceMode } from "./voice-mode";
import {
  PERSONAS,
  personaById,
  type ChatMessage,
  type Persona,
  type PersonaId,
} from "./data";

const EASE = [0.16, 1, 0.3, 1] as const;
const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

/* ════════════════════════════════════════════════ Header */

function Header({
  onReset,
  memoryOpen,
  onToggleMemory,
  memoryCount,
  started,
  onWipe,
}: {
  onReset: () => void;
  memoryOpen: boolean;
  onToggleMemory: () => void;
  memoryCount: number;
  started: boolean;
  onWipe: () => void;
}) {
  return (
    <header className="relative z-30 shrink-0 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Logo className="h-[20px] w-auto" />
          <span
            className="hidden whitespace-nowrap rounded-full px-2.5 py-1 text-[0.7rem] font-bold sm:inline"
            style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
          >
            상담 봇
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onWipe}
            title="모든 대화·기억 삭제 (테스트용)"
            aria-label="모든 대화·기억 삭제"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/[0.04] text-ink-soft transition-colors hover:bg-red-500/10 hover:text-red-500"
          >
            <Trash2 size={15} />
          </button>
          <button
            onClick={onToggleMemory}
            className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[0.8rem] font-semibold transition-colors ${
              memoryOpen ? "text-white" : "bg-ink/[0.04] text-ink-soft hover:text-ink"
            }`}
            style={memoryOpen ? { background: "var(--accent-strong)" } : undefined}
          >
            기억
            <span
              className={`num rounded-full px-1.5 text-[0.68rem] ${
                memoryOpen ? "bg-white/25" : "bg-ink/[0.06]"
              }`}
            >
              {memoryCount}
            </span>
          </button>
          {started ? (
            <button
              onClick={onReset}
              className="flex h-9 items-center rounded-full bg-ink/[0.04] px-3.5 text-[0.8rem] font-semibold text-ink-soft transition-colors hover:text-ink"
            >
              새 세션
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/* ════════════════════════════════════════════════ Memory panel (manage) */

function MemoryPanel({
  open,
  onClose,
  memories,
  enabled,
}: {
  open: boolean;
  onClose: () => void;
  memories: string[];
  enabled: boolean;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="fixed inset-0 z-30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="absolute right-4 top-[3.6rem] z-40 w-[min(20.5rem,calc(100vw-2rem))] rounded-[1.75rem] bg-surface-2 p-2 ring-1 ring-ink/[0.04]"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            <div className="flex items-center justify-between px-3 pb-2 pt-2.5">
              <span className="text-sm font-bold text-ink">기억하고 있는 것</span>
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-ink/[0.05] hover:text-ink"
              >
                <X size={14} />
              </button>
            </div>
            {memories.length ? (
              <ul className="flex max-h-[50vh] flex-col gap-0.5 overflow-y-auto">
                {memories.map((m, i) => (
                  <li
                    key={`${i}-${m.slice(0, 12)}`}
                    className="flex gap-2.5 rounded-2xl px-3 py-2.5 text-[0.83rem] leading-relaxed text-ink-soft transition-colors hover:bg-surface"
                  >
                    <span
                      className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: "var(--accent)" }}
                    />
                    {m}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-3 text-[0.82rem] leading-relaxed text-ink-faint">
                {enabled
                  ? "아직 기억된 내용이 없어요. 대화를 나누면 다음 상담을 위해 기억해 둘게요."
                  : "기억 기능(supermemory)이 아직 연결되지 않았어요."}
              </p>
            )}
            <p className="px-3 pb-2 pt-2.5 text-[0.72rem] leading-relaxed text-ink-faint">
              supermemory에 저장돼, 새 세션을 열어도 이어집니다.
            </p>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

/* ════════════════════════════════════════════════ Persona avatar (video) */

function Avatar({ persona, size = 34 }: { persona: Persona; size?: number }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size, background: "var(--accent-soft)" }}
    >
      <video
        src={persona.video}
        autoPlay
        loop
        muted
        playsInline
        className="h-full w-full object-cover"
      />
    </div>
  );
}

/* ════════════════════════════════════════════════ Persona select */

function PersonaSelect({ onPick }: { onPick: (id: PersonaId) => void }) {
  return (
    <div className="relative flex min-h-full flex-col items-center justify-center overflow-hidden px-4 py-12">
      <video
        src="/counselor_background.mp4"
        autoPlay
        loop
        muted
        playsInline
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.06]"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-bg via-bg/60 to-bg" />

      <div className="relative w-full max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="flex flex-col items-center gap-3 text-center"
        >
          <span
            className="inline-flex items-center rounded-full px-3 py-1.5 text-[0.78rem] font-semibold"
            style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
          >
            CBT 기반 음성·대화 상담
          </span>
          <h1 className="display text-balance text-[2rem] font-extrabold text-ink sm:text-4xl">
            어떤 마음으로 이야기 나눠볼까요?
          </h1>
          <p className="balance max-w-md text-[0.95rem] leading-relaxed text-ink-soft">
            편한 상담 스타일을 골라주세요. 대화는 언제든 당신의 속도에 맞춰 진행돼요.
          </p>
        </motion.div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {PERSONAS.map((p, i) => (
            <motion.button
              key={p.id}
              onClick={() => onPick(p.id)}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.1 + i * 0.07 }}
              whileHover={{ y: -4 }}
              className="group flex flex-col items-center gap-3 rounded-[1.75rem] bg-surface-2 p-5 text-center transition-colors hover:bg-white"
            >
              <Avatar persona={p} size={84} />
              <div className="flex flex-col gap-0.5">
                <span className="text-base font-bold text-ink">{p.label}</span>
                <span className="text-[0.72rem] font-medium text-ink-faint">
                  {p.character} · {p.en}
                </span>
              </div>
              <p className="text-[0.82rem] leading-relaxed text-ink-soft">{p.desc}</p>
              <span
                className="mt-1 inline-flex h-9 items-center rounded-full px-4 text-[0.8rem] font-bold text-white opacity-90 transition-opacity group-hover:opacity-100"
                style={{ background: "var(--accent-strong)" }}
              >
                이 스타일로 시작
              </span>
            </motion.button>
          ))}
        </div>

        <p className="mt-8 text-center text-[0.72rem] text-ink-faint">
          OpenRouter 기반 · 대화 내용은 다음 상담을 위해 안전하게 기억돼요.
        </p>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════ Collapse (height:auto) */

/**
 * 접기/펼치기 — 네이티브 CSS `interpolate-size: allow-keywords` 로 height:0↔auto 를 transition.
 * JS 측정 없이 브라우저가 직접 보간하므로 레이아웃 시프트/튐이 없다.
 * instant=true: transition 없이 즉시(스트리밍으로 자라는 동안 마지막 줄 가림 방지 / 자동 접힘).
 */
function Collapse({
  open,
  children,
  instant = false,
}: {
  open: boolean;
  children: ReactNode;
  instant?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden [interpolate-size:allow-keywords] ${
        instant
          ? ""
          : "transition-[height,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
      }`}
      style={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
    >
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════ Memory recall (chat top) */

function MemoryRecall({ memories }: { memories: string[] }) {
  const [open, setOpen] = useState(false);
  if (!memories.length) return null;
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="group flex items-center gap-1 text-[0.8rem]"
      >
        <span className="font-medium text-ink-faint transition-colors group-hover:text-ink-soft">
          이전 대화를 기억하고 이어가요
        </span>
        <ChevronDown
          size={13}
          className={`text-ink-faint/70 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <Collapse open={open}>
        <ul className="ml-[6px] mt-2 flex flex-col gap-1.5 border-l-2 border-ink/[0.08] pl-3.5">
          {memories.map((m, i) => (
            <li key={`${i}-${m.slice(0, 12)}`} className="text-[0.82rem] leading-[1.6] text-ink-faint">
              {m}
            </li>
          ))}
        </ul>
      </Collapse>
    </div>
  );
}

/* ════════════════════════════════════════════════ Reasoning (thinking) */

function Reasoning({
  text,
  live,
  thinkMs,
}: {
  text: string;
  live: boolean;
  thinkMs?: number;
}) {
  // 자동: 생각 중 펼침 → 답변 시작 시 접힘. 자동 전환은 transition 없이 즉시(슬라이드 없음).
  // 사용자가 직접 토글할 때만 부드럽게 애니메이션.
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? live;
  const instant = userOpen === null;

  if (!text && !live) return null;
  const seconds = thinkMs ? Math.max(1, Math.round(thinkMs / 1000)) : null;

  return (
    <div className="mb-1.5">
      <button
        onClick={() => setUserOpen(!open)}
        className="group flex items-center gap-1 text-[0.8rem]"
      >
        {live ? (
          <span className="shimmer-text font-semibold">생각하는 중</span>
        ) : (
          <span className="font-medium text-ink-faint transition-colors group-hover:text-ink-soft">
            {seconds ? `${seconds}초 동안 생각했어요` : "추론 과정"}
          </span>
        )}
        <ChevronDown
          size={13}
          className={`text-ink-faint/70 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <Collapse open={open} instant={instant}>
        <p className="ml-[6px] mt-2 whitespace-pre-line border-l-2 border-ink/[0.08] pl-3.5 text-[0.82rem] leading-[1.7] text-ink-faint">
          {text}
          {live ? <Caret /> : null}
        </p>
      </Collapse>
    </div>
  );
}

function Caret() {
  return (
    <motion.span
      className="ml-0.5 inline-block h-[0.9em] w-[2px] translate-y-[2px] rounded-full align-middle"
      style={{ background: "var(--accent)" }}
      animate={{ opacity: [1, 0] }}
      transition={{ duration: 0.7, repeat: Infinity }}
    />
  );
}

/* ════════════════════════════════════════════════ Message */

function MessageBubble({
  msg,
  persona,
  canRegenerate = false,
  onRegenerate,
  onEdit,
}: {
  msg: ChatMessage;
  persona: Persona;
  canRegenerate?: boolean;
  onRegenerate?: () => void;
  onEdit?: (id: string, text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  // 스트리밍 중 매 델타마다 전 메시지가 재렌더된다 — 마커 제거는 내용이 바뀔 때만.
  // (조기 return 보다 위에 있어야 하는 훅이라 user 분기 앞에 둔다)
  const displayContent = useMemo(() => stripControlMarkers(msg.content), [msg.content]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(stripControlMarkers(msg.content));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard 차단 환경 무시 */
    }
  };

  if (msg.role === "user") {
    if (editing) {
      const save = () => {
        const t = draft.trim();
        if (t) onEdit?.(msg.id, t);
        setEditing(false);
      };
      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-end">
          <div className="w-full max-w-[82%] rounded-3xl rounded-br-md bg-surface-2 p-2.5 ring-1 ring-ink/[0.06]">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDraft(msg.content);
                  setEditing(false);
                  return;
                }
                if (e.key !== "Enter" || e.shiftKey) return;
                // IME 조합 중 Enter 는 글자 확정용 → 저장하지 않는다(마지막 글자 중복 방지)
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                e.preventDefault();
                save();
              }}
              className="max-h-40 w-full resize-none bg-transparent px-1.5 py-1 text-[0.95rem] leading-relaxed text-ink outline-none"
              rows={Math.min(6, draft.split("\n").length || 1)}
            />
            <div className="mt-1 flex items-center justify-end gap-1.5">
              <button
                onClick={() => {
                  setDraft(msg.content);
                  setEditing(false);
                }}
                className="rounded-full px-3 py-1.5 text-[0.78rem] font-semibold text-ink-soft transition-colors hover:bg-ink/[0.05]"
              >
                취소
              </button>
              <button
                onClick={save}
                disabled={!draft.trim()}
                className="rounded-full px-3.5 py-1.5 text-[0.78rem] font-bold text-white transition-all disabled:opacity-40"
                style={{ background: "var(--accent-strong)" }}
              >
                저장 후 재요청
              </button>
            </div>
          </div>
        </motion.div>
      );
    }
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="group flex items-center justify-end gap-1.5"
      >
        {onEdit ? (
          <button
            onClick={() => {
              setDraft(msg.content);
              setEditing(true);
            }}
            className="shrink-0 px-1 text-[0.74rem] font-medium text-ink-faint opacity-0 transition-opacity hover:text-ink-soft group-hover:opacity-100"
          >
            수정
          </button>
        ) : null}
        <div
          className="max-w-[82%] whitespace-pre-line rounded-3xl rounded-br-md px-4 py-2.5 text-[0.95rem] leading-relaxed text-white"
          style={{ background: "var(--accent)" }}
        >
          {msg.content}
        </div>
      </motion.div>
    );
  }

  // reasoning을 실제로 내보낸 모델에서만 "생각하는 중" UI를 표시한다.
  const reasoningLive = !!msg.streaming && !!msg.reasoning && msg.content.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: EASE }}
      className="flex items-start gap-3"
    >
      <Avatar persona={persona} />
      <div className="flex min-w-0 flex-1 flex-col pt-0.5">
        <span className="mb-1.5 text-[0.82rem] font-bold text-ink">{persona.character}</span>

        <Reasoning text={msg.reasoning ?? ""} live={reasoningLive} thinkMs={msg.thinkMs} />

        {msg.content ? (
          <Streamdown className="counsel-md text-[0.97rem] leading-[1.75] text-ink [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2">
            {displayContent}
          </Streamdown>
        ) : null}

        {msg.error ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="mt-2 inline-flex w-fit items-center gap-1.5 text-[0.74rem] font-medium"
            style={{ color: "var(--accent-strong)" }}
          >
            <span className="inline-block h-1 w-1 rounded-full" style={{ background: "var(--accent)" }} />
            응답 중 문제가 생겼어요. 다시 시도해 주세요.
          </motion.div>
        ) : msg.interrupted ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="mt-2 inline-flex w-fit items-center gap-1.5 text-[0.74rem] font-medium text-ink-faint"
          >
            <span className="inline-block h-1 w-1 rounded-full bg-ink-faint" />
            답변을 멈췄어요
          </motion.div>
        ) : null}

        {/* 메시지 액션 — 복사 / 다시 생성 (스트리밍 끝난 응답에만) */}
        {!msg.streaming && (msg.content || msg.error) ? (
          <div className="mt-2 flex items-center gap-3 opacity-70 transition-opacity hover:opacity-100">
            {msg.content ? (
              <button
                onClick={copy}
                className="text-[0.74rem] font-medium text-ink-faint transition-colors hover:text-ink-soft"
              >
                {copied ? "복사됨" : "복사"}
              </button>
            ) : null}
            {canRegenerate ? (
              <button
                onClick={onRegenerate}
                className="text-[0.74rem] font-medium text-ink-faint transition-colors hover:text-ink-soft"
              >
                다시 생성
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════ Composer */

function Composer({
  onSend,
  onStop,
  onVoice,
  streaming,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  onVoice: () => void;
  streaming: boolean;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const grow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  const hasText = value.trim().length > 0;
  // 스트리밍 중 입력이 비면 '멈추기', 입력이 있으면 '끼어들어 전송'(barge-in).
  const showStop = streaming && !hasText;

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue("");
    requestAnimationFrame(() => {
      if (ref.current) ref.current.style.height = "auto";
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    // IME(한글·일본어 등) 조합 중 Enter 는 글자 확정용 → 전송하지 않는다.
    // (조합 중 전송하면 마지막 글자가 한 번 더 입력되는 클래식 버그)
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    submit();
  };

  return (
    <div className="shrink-0 bg-gradient-to-t from-bg via-bg to-transparent pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2">
      <div className="mx-auto w-full max-w-3xl px-4">
        <div className="flex items-end gap-2 rounded-[1.6rem] bg-surface-2 p-2 pl-4 ring-1 ring-ink/[0.04] transition-shadow focus-within:ring-ink/[0.08]">
          <textarea
            ref={ref}
            rows={1}
            autoFocus
            aria-label="메시지 입력"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              grow();
            }}
            onKeyDown={onKeyDown}
            placeholder={streaming ? "이어서 입력하면 지금 답변을 멈추고 들어요…" : "지금 마음을 편하게 적어보세요…"}
            className="max-h-[140px] flex-1 resize-none bg-transparent py-2 text-[0.95rem] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
          />
          {!streaming && !hasText ? (
            <button
              onClick={onVoice}
              aria-label="음성으로 대화하기"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink/[0.05] text-ink-soft transition-colors hover:text-ink"
            >
              <Mic size={18} />
            </button>
          ) : null}
          {showStop ? (
            <button
              onClick={onStop}
              aria-label="멈추기"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-transform active:scale-95"
            >
              <Square size={15} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!hasText}
              aria-label={streaming ? "멈추고 보내기" : "보내기"}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-all active:scale-95 disabled:opacity-30"
              style={{ background: "var(--accent-strong)" }}
            >
              <ArrowUp size={18} />
            </button>
          )}
        </div>
        <p className="mt-2 px-1 text-center text-[0.7rem] text-ink-faint">
          {streaming
            ? "응답 중 · 멈추거나, 이어서 입력해 끼어들 수 있어요"
            : "Enter 전송 · Shift+Enter 줄바꿈 · 위기 상황이라면 정신건강위기상담 1577-0199"}
        </p>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════ Main */

export function CounselChat() {
  const [personaId, setPersonaId] = useState<PersonaId | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memories, setMemories] = useState<string[]>([]);
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [booting, setBooting] = useState(true);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [externalId, setExternalId] = useState("");

  const externalIdRef = useRef<string>("");
  const sessionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const refreshMemories = useCallback(async () => {
    const id = externalIdRef.current;
    if (!id) return;
    try {
      const res = await fetch(`/api/counsel/memories?externalId=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { enabled?: boolean; memories?: string[] };
      setMemoryEnabled(!!data.enabled);
      setMemories(Array.isArray(data.memories) ? data.memories : []);
    } catch {
      /* ignore */
    }
  }, []);

  // 마운트: 안정 식별자 확보 → 마지막 세션 복원.
  // supermemory 목록은 부팅을 막지 않고 사용자가 기억 패널을 열 때만 가져온다.
  useEffect(() => {
    let id = localStorage.getItem("kkebi_uid");
    if (!id) {
      id = uid();
      localStorage.setItem("kkebi_uid", id);
    }
    externalIdRef.current = id;

    let cancelled = false;
    (async () => {
      setExternalId(id);
      const storedSession = localStorage.getItem("kkebi_session");
      if (storedSession && id) {
        try {
          const res = await fetch(
            `/api/counsel/session?externalId=${encodeURIComponent(id)}&sessionId=${encodeURIComponent(storedSession)}`
          );
          if (res.ok) {
            const data = (await res.json()) as {
              session: { id: string; persona: PersonaId } | null;
              messages: Array<{
                id: string;
                role: "user" | "assistant";
                content: string;
                reasoning: string | null;
                thinkMs: number | null;
                interrupted: boolean;
              }>;
            };
            if (!cancelled && data.session && data.messages.length) {
              sessionIdRef.current = data.session.id;
              setPersonaId(data.session.persona);
              setMessages(
                data.messages.map((m) => ({
                  id: m.id,
                  role: m.role,
                  content: m.content,
                  reasoning: m.reasoning ?? undefined,
                  thinkMs: m.thinkMs ?? undefined,
                  interrupted: m.interrupted || undefined,
                }))
              );
            } else {
              localStorage.removeItem("kkebi_session");
            }
          }
        } catch {
          /* 복원 실패 — 새로 시작 */
        }
      }
      if (!cancelled) setBooting(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshMemories]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    stick.current = true;
    setShowJump(false);
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick.current = distance < 80;
    setShowJump(distance > 240);
  };

  useEffect(() => {
    if (stick.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const patchMsg = (id: string, fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));

  const runAssistant = useCallback(
    async (
      persona: PersonaId,
      opts: {
        userMessage?: string;
        userMessageId?: string;
        regenerate?: boolean;
        editMessageId?: string;
        history?: ChatMessage[];
      } = {}
    ) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);

      const msgId = uid();
      setMessages((prev) => [
        ...prev,
        { id: msgId, role: "assistant", content: "", reasoning: "", streaming: true },
      ]);

      const started = performance.now();
      let contentStarted = false;

      try {
        const result = await streamReply(
          {
            externalId: externalIdRef.current,
            sessionId: sessionIdRef.current,
            persona,
            userMessage: opts.userMessage,
            userMessageId: opts.userMessageId,
            regenerate: opts.regenerate,
            editMessageId: opts.editMessageId,
            history: opts.history?.slice(-24).map(({ id, role, content }) => ({
              id,
              role,
              content,
            })),
          },
          {
            onMeta: ({ sessionId, memoryEnabled: en, memories: recalled }) => {
              if (sessionId) {
                sessionIdRef.current = sessionId;
                try {
                  localStorage.setItem("kkebi_session", sessionId);
                } catch {
                  /* ignore */
                }
              }
              setMemoryEnabled(en);
              if (recalled?.length) setMemories(recalled);
            },
            onReasoningDelta: (d) =>
              patchMsg(msgId, (m) => ({ ...m, reasoning: (m.reasoning ?? "") + d })),
            onContentDelta: (d) => {
              if (!contentStarted) {
                contentStarted = true;
                patchMsg(msgId, (m) => ({
                  ...m,
                  thinkMs: performance.now() - started,
                }));
              }
              patchMsg(msgId, (m) => ({ ...m, content: m.content + d }));
            },
            signal: controller.signal,
          }
        );

        if (result.error) {
          setMessages((prev) => {
            const msg = prev.find((m) => m.id === msgId);
            if (!msg) return prev;
            // 내용이 전혀 없으면(서버 오류) 자리만 차지하지 않도록 에러 표시만
            return prev.map((m) =>
              m.id === msgId ? { ...m, streaming: false, error: true } : m
            );
          });
        } else {
          // 마커 등 제어 토큰이 상태에 남으면 이후 history 로 LLM 에 되돌아간다 — 종료 시 정리
          patchMsg(msgId, (m) => ({
            ...m,
            streaming: false,
            content: stripControlMarkers(m.content),
          }));
        }
      } catch {
        // 중단(stop)·끼어들기(barge-in): 답변 있으면 '멈춤'으로 보존, 없으면 제거.
        setMessages((prev) => {
          const msg = prev.find((m) => m.id === msgId);
          if (!msg) return prev;
          if (!msg.content && !msg.reasoning) return prev.filter((m) => m.id !== msgId);
          return prev.map((m) =>
            m.id === msgId ? { ...m, streaming: false, interrupted: true } : m
          );
        });
      } finally {
        if (abortRef.current === controller) {
          setStreaming(false);
          abortRef.current = null;
        }
      }
    },
    []
  );

  const pickPersona = (id: PersonaId) => {
    setPersonaId(id);
    sessionIdRef.current = null; // 새 세션
    localStorage.removeItem("kkebi_session");
    stick.current = true;
    setMessages([]);
    runAssistant(id); // 오프닝 인사(기억 활용)
  };

  const send = (text: string) => {
    if (!personaId) return;
    abortRef.current?.abort(); // 응답 중이면 끼어들기
    stick.current = true;
    const id = uid();
    setMessages((prev) => [...prev, { id, role: "user", content: text }]);
    runAssistant(personaId, { userMessage: text, userMessageId: id, history: messages });
  };

  // 유저 메시지 수정 → 그 메시지 이후를 잘라내고 새 내용으로 재생성.
  // history 는 보내지 않는다 — 서버는 수정/재생성 경로에서 DB 를 신뢰 소스로 쓴다.
  const editMessage = (messageId: string, newText: string) => {
    if (!personaId) return;
    abortRef.current?.abort();
    stick.current = true;
    const newId = uid();
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), { id: newId, role: "user", content: newText }];
    });
    runAssistant(personaId, {
      editMessageId: messageId,
      userMessage: newText,
      userMessageId: newId,
    });
  };

  const regenerate = () => {
    if (streaming || !personaId) return;
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    setMessages(last ? messages.filter((m) => m.id !== last.id) : messages);
    stick.current = true;
    runAssistant(personaId, { regenerate: true });
  };

  const stop = () => abortRef.current?.abort();

  // 음성 모드 턴 완료 — 대화에 메시지 반영(서버에는 이미 저장됨).
  // assistant 가 null 이면 답변 시작 전에 닫힌 턴 — 사용자 발화만 남긴다.
  const onVoiceTurn = useCallback(
    (user: ChatMessage, assistant: ChatMessage | null) => {
      stick.current = true;
      setMessages((prev) => [...prev, user, ...(assistant ? [assistant] : [])]);
    },
    []
  );

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setVoiceOpen(false);
    setPersonaId(null);
    setMessages([]);
    setStreaming(false);
    setShowJump(false);
    stick.current = true;
    sessionIdRef.current = null;
    localStorage.removeItem("kkebi_session");
  };

  // 전체 초기화(테스트용) — 서버의 모든 세션·기억을 지우고 식별자까지 새로 발급한다.
  // 서버 삭제가 일부 실패해도 uid 를 회전하므로 사용자 입장에선 항상 깨끗하게 시작된다.
  const wipeAll = async () => {
    if (!confirm("모든 대화 세션과 기억을 삭제할까요? 되돌릴 수 없어요.")) return;
    abortRef.current?.abort();
    try {
      await fetch(
        `/api/counsel/session?externalId=${encodeURIComponent(externalIdRef.current)}`,
        { method: "DELETE" }
      );
    } catch {
      /* 서버 삭제 실패 — 아래 uid 회전으로 체감상 초기화는 보장된다 */
    }
    localStorage.removeItem("kkebi_session");
    localStorage.removeItem("kkebi_uid");
    location.reload();
  };

  const persona = personaId ? personaById(personaId) : null;
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  return (
    <div className="relative flex h-[100dvh] flex-col bg-bg">
      <Header
        onReset={reset}
        memoryOpen={memoryOpen}
        onToggleMemory={() => {
          setMemoryOpen((open) => {
            if (!open) void refreshMemories();
            return !open;
          });
        }}
        memoryCount={memories.length}
        started={!!persona}
        onWipe={wipeAll}
      />
      <MemoryPanel
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        memories={memories}
        enabled={memoryEnabled}
      />

      <div ref={scrollerRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
        {booting ? (
          <div className="flex min-h-full items-center justify-center">
            <span className="shimmer-text text-sm font-semibold">불러오는 중</span>
          </div>
        ) : persona ? (
          <div
            role="log"
            aria-live="polite"
            aria-label="상담 대화"
            className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6"
          >
            <MemoryRecall memories={memories} />
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                msg={m}
                persona={persona}
                canRegenerate={!streaming && m.id === lastAssistantId}
                onRegenerate={regenerate}
                onEdit={!streaming ? editMessage : undefined}
              />
            ))}
            <div ref={bottomRef} className="h-1" />
          </div>
        ) : (
          <PersonaSelect onPick={pickPersona} />
        )}
      </div>

      <AnimatePresence>
        {persona && showJump ? (
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18, ease: EASE }}
            onClick={() => scrollToBottom()}
            aria-label="맨 아래로"
            className="absolute bottom-28 left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full bg-surface-2 text-ink-soft ring-1 ring-ink/[0.06] transition-colors hover:text-ink"
          >
            <ArrowDown size={17} />
          </motion.button>
        ) : null}
      </AnimatePresence>

      {!booting && persona ? (
        <Composer
          onSend={send}
          onStop={stop}
          onVoice={() => {
            abortRef.current?.abort(); // 텍스트 응답 중이면 끊고 음성으로
            setVoiceOpen(true);
          }}
          streaming={streaming}
        />
      ) : null}

      <AnimatePresence>
        {voiceOpen && persona ? (
          <VoiceMode
            persona={persona}
            externalId={externalId}
            getSessionId={() => sessionIdRef.current}
            setSessionId={(id) => {
              sessionIdRef.current = id;
              try {
                localStorage.setItem("kkebi_session", id);
              } catch {
                /* ignore */
              }
            }}
            onTurn={onVoiceTurn}
            onClose={() => setVoiceOpen(false)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
