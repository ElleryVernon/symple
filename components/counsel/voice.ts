/**
 * 음성 모드 코어 — Cartesia STT/TTS WebSocket + 브라우저 오디오 파이프라인.
 *
 * E2E 레이턴시 최소화 설계:
 * - 임시 access token 으로 브라우저 ↔ Cartesia 직결(서버 프록시 홉 제거)
 * - 마이크: AudioWorklet → PCM16@16k 를 ~100ms 단위 바이너리 전송(실시간 부분 전사)
 * - TTS: 한 컨텍스트에 문장 단위 continuation(continue=true)으로 LLM 델타를 흘려보냄
 * - 재생: raw PCM(f32 변환) 을 Web Audio 로 갭리스 스케줄 — 디코딩 지연 없음
 * - barge-in: 재생 중 사용자 발화 감지 시 컨텍스트 cancel + 재생 즉시 중단
 */

export interface VoiceConfig {
  token: string;
  version: string;
  stt: { model: string; language: string; sampleRate: number; encoding: string };
  tts: { model: string; voiceId: string; language: string; sampleRate: number };
}

export async function fetchVoiceConfig(): Promise<VoiceConfig> {
  const res = await fetch("/api/voice/token", { method: "POST" });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? "음성 토큰 발급에 실패했어요.");
  }
  return (await res.json()) as VoiceConfig;
}

/* ─────────────────────────────────────────────── Mic capture (PCM16 @16k) */

const WORKLET_SRC = `
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

export class MicCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private buf: Float32Array[] = [];
  private buffered = 0;
  /** ~100ms @16k */
  private readonly CHUNK = 1600;
  muted = false;
  /** 평활화된 입력 레벨(0~1 근사) — orb 시각화용 */
  private rms = 0;

  /** orb 용 정규화 레벨 */
  getLevel(): number {
    return Math.min(1, this.rms * 6);
  }

  /** onChunk 는 PCM16 청크와 그 청크의 RMS 레벨(0~1 근사)을 함께 받는다 — barge-in 감지용 */
  async start(onChunk: (pcm16: ArrayBuffer, level: number) => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true, // 핸즈프리: 스피커 출력 에코 제거
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    // 16k 로 컨텍스트를 만들어 브라우저가 리샘플링하게 한다
    this.ctx = new AudioContext({ sampleRate: 16000 });
    const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "text/javascript" }));
    try {
      await this.ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
    });
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      // 레벨 미터링(음소거여도 0 으로 수렴)
      const d = e.data;
      let sum = 0;
      for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
      const r = this.muted ? 0 : Math.sqrt(sum / d.length);
      this.rms += (r - this.rms) * 0.3;
      // 음소거 중에도 무음 청크를 계속 흘린다 — STT 소켓 idle 종료 방지(킵얼라이브)
      this.buf.push(this.muted ? new Float32Array(d.length) : e.data);
      this.buffered += e.data.length;
      while (this.buffered >= this.CHUNK) {
        const out = new Int16Array(this.CHUNK);
        let filled = 0;
        let sumSq = 0;
        while (filled < this.CHUNK && this.buf.length) {
          const head = this.buf[0];
          const take = Math.min(head.length, this.CHUNK - filled);
          for (let i = 0; i < take; i++) {
            const s = Math.max(-1, Math.min(1, head[i]));
            sumSq += s * s;
            out[filled + i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          filled += take;
          if (take === head.length) this.buf.shift();
          else this.buf[0] = head.subarray(take);
        }
        this.buffered -= this.CHUNK;
        onChunk(out.buffer, Math.sqrt(sumSq / this.CHUNK));
      }
    };
    src.connect(this.node);
  }

  /** 모바일 등에서 AudioContext 가 suspend 되면 수음이 조용히 멈춘다 — 워치독에서 복구 */
  async resume() {
    if (this.ctx?.state === "suspended") await this.ctx.resume().catch(() => {});
  }

  stop() {
    this.node?.port.close();
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    this.node = null;
    this.stream = null;
    this.ctx = null;
    this.buf = [];
    this.buffered = 0;
  }
}

/* ─────────────────────────────────────────────── STT socket (ink-whisper) */

export interface SttEvents {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (msg: string) => void;
  onClose?: () => void;
}

export class SttSocket {
  private ws: WebSocket | null = null;

  async connect(cfg: VoiceConfig, ev: SttEvents): Promise<void> {
    const q = new URLSearchParams({
      model: cfg.stt.model,
      language: cfg.stt.language,
      encoding: cfg.stt.encoding,
      sample_rate: String(cfg.stt.sampleRate),
      cartesia_version: cfg.version,
      access_token: cfg.token,
      // 침묵 시 자동 finalize — 턴 감지의 1차 신호 (짧을수록 반응 빠름)
      max_silence_duration_secs: "0.6",
      // 마이크단에서 이미 noiseSuppression/echoCancellation 으로 정제되므로 STT 게이트는
      // 약하게만 — 너무 높으면(0.15) 조용히 흘리는 종결어미가 무음 처리돼 끝단어가 씹힌다.
      min_volume: "0.06",
    });
    const ws = new WebSocket(`wss://api.cartesia.ai/stt/websocket?${q}`);
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("STT 연결에 실패했어요."));
    });
    ws.onerror = null;
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data as string) as {
          type: string;
          text?: string;
          is_final?: boolean;
          message?: string;
        };
        if (m.type === "transcript") ev.onTranscript(m.text ?? "", !!m.is_final);
        else if (m.type === "error") ev.onError?.(m.message ?? "STT 오류");
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => ev.onClose?.();
  }

  sendAudio(chunk: ArrayBuffer) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(chunk);
  }

  /** 소켓 생존 여부 — 죽어 있으면 sendAudio 가 조용히 버리므로 워치독이 확인한다 */
  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  close() {
    if (!this.ws) return;
    this.ws.onclose = null; // 의도적 종료 — onClose(재연결) 콜백 억제
    try {
      if (this.ws.readyState === WebSocket.OPEN) this.ws.send("close");
    } catch {
      /* ignore */
    }
    this.ws.close();
    this.ws = null;
  }
}

/* ─────────────────────────────────────────────── PCM streaming player */

export class PcmPlayer {
  private ctx: AudioContext;
  private gain: GainNode;
  private analyser: AnalyserNode;
  private meterBuf: Float32Array<ArrayBuffer>;
  private playhead = 0;
  private active = new Set<AudioBufferSourceNode>();
  private ended = false;
  onDrain: (() => void) | null = null;

  constructor(private sampleRate: number) {
    this.ctx = new AudioContext({ sampleRate });
    this.gain = this.ctx.createGain(); // barge-in 페이드아웃용 마스터 게인
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.gain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.meterBuf = new Float32Array(this.analyser.fftSize);
  }

  /** orb 용 출력 레벨(0~1 근사) */
  getLevel(): number {
    this.analyser.getFloatTimeDomainData(this.meterBuf);
    let sum = 0;
    for (let i = 0; i < this.meterBuf.length; i++) sum += this.meterBuf[i] * this.meterBuf[i];
    return Math.min(1, Math.sqrt(sum / this.meterBuf.length) * 4);
  }

  /** TTS 청크(base64 pcm_s16le) 즉시 스케줄 */
  enqueueBase64(b64: string) {
    // 자동재생 정책/백그라운드 전환으로 suspend 됐을 수 있다(특히 iOS) — 재생 전 복구
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pcm = new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2));
    if (!pcm.length) return;

    const f32 = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 0x8000;

    const buf = this.ctx.createBuffer(1, f32.length, this.sampleRate);
    buf.getChannelData(0).set(f32);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);

    const now = this.ctx.currentTime;
    if (this.playhead < now + 0.04) this.playhead = now + 0.04; // 첫 청크 최소 리드
    src.start(this.playhead);
    this.playhead += buf.duration;

    this.active.add(src);
    src.onended = () => {
      this.active.delete(src);
      if (this.ended && this.active.size === 0) this.onDrain?.();
    };
  }

  /** 스트림 끝 신호 — 남은 재생이 끝나면 onDrain 호출 */
  markEnd() {
    this.ended = true;
    if (this.active.size === 0) this.onDrain?.();
  }

  /** barge-in: 짧은 페이드아웃 후 전부 중단 — 하드컷 클릭음 없이 자연스럽게 끊는다 */
  stopAll() {
    this.ended = false;
    const victims = [...this.active];
    this.active.clear();
    this.playhead = 0;
    try {
      const g = this.gain.gain;
      const now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + 0.07);
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      for (const s of victims) {
        try {
          s.onended = null;
          s.stop();
        } catch {
          /* ignore */
        }
      }
      this.restoreGain(); // 다음 턴을 위해 복원 (destroy 후라면 조용히 실패)
    }, 90);
  }

  /** 페이드 스케줄을 걷어내고 풀 볼륨으로 — stopAll 후속/새 턴 시작 공용 */
  private restoreGain() {
    try {
      const g = this.gain.gain;
      g.cancelScheduledValues(this.ctx.currentTime);
      g.setValueAtTime(1, this.ctx.currentTime);
    } catch {
      /* ignore */
    }
  }

  get playing() {
    return this.active.size > 0;
  }

  reset() {
    this.ended = false;
    this.restoreGain(); // 페이드 직후 새 턴이 시작돼도 항상 풀 볼륨에서 출발
  }

  async destroy() {
    this.stopAll();
    await this.ctx.close().catch(() => {});
  }
}

/* ─────────────────────────────────────────────── TTS socket (sonic, ko) */

export class TtsSocket {
  private ws: WebSocket | null = null;
  private cfg: VoiceConfig | null = null;

  async connect(
    cfg: VoiceConfig,
    onChunk: (b64: string, contextId: string) => void,
    onDone: (contextId: string) => void,
    onError?: (msg: string) => void,
    onClose?: () => void
  ): Promise<void> {
    this.cfg = cfg;
    const q = new URLSearchParams({
      cartesia_version: cfg.version,
      access_token: cfg.token,
    });
    const ws = new WebSocket(`wss://api.cartesia.ai/tts/websocket?${q}`);
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("TTS 연결에 실패했어요."));
    });
    ws.onerror = null;
    ws.onclose = () => onClose?.();
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data as string) as {
          type: string;
          data?: string;
          context_id?: string;
          message?: string;
        };
        if (m.type === "chunk" && m.data) onChunk(m.data, m.context_id ?? "");
        else if (m.type === "done") onDone(m.context_id ?? "");
        else if (m.type === "error") onError?.(m.message ?? "TTS 오류");
      } catch {
        /* ignore */
      }
    };
  }

  /**
   * 문장 단위 continuation — 같은 context_id 로 이어 보낸다.
   * isFinal=true 일 때만 continue:false (실제 텍스트와 함께)로 컨텍스트를 닫는다.
   * 빈 transcript 로는 절대 닫지 않는다(서버가 컨텍스트 없음 에러를 낸다).
   * @returns 실제로 전송됐는지 — 소켓이 죽어 조용히 버려지는 걸 호출부가 알 수 있게.
   */
  speak(contextId: string, transcript: string, isFinal: boolean): boolean {
    if (!this.cfg || this.ws?.readyState !== WebSocket.OPEN || !transcript.trim()) return false;
    this.ws.send(
      JSON.stringify({
        model_id: this.cfg.tts.model,
        voice: { mode: "id", id: this.cfg.tts.voiceId },
        language: this.cfg.tts.language,
        context_id: contextId,
        transcript,
        continue: !isFinal,
        // 문장이 이미 완성돼 들어오므로 버퍼 대기를 짧게 → 첫 오디오 빨라짐
        max_buffer_delay_ms: 200,
        output_format: {
          container: "raw",
          encoding: "pcm_s16le",
          sample_rate: this.cfg.tts.sampleRate,
        },
      })
    );
    return true;
  }

  cancel(contextId: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ context_id: contextId, cancel: true }));
  }

  /** 소켓 생존 여부 — 죽어 있으면 speak 가 조용히 버리므로 워치독이 확인한다 */
  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  close() {
    if (!this.ws) return;
    this.ws.onclose = null; // 의도적 종료 — onClose(재연결) 콜백 억제
    this.ws.close();
    this.ws = null;
  }
}

/* ─────────────────────────────────────────────── 문장 분할기 (LLM 델타 → TTS) */

/**
 * TTS 로 읽히기 전 정제 — 모델이 지시문/마크다운을 내보내도 음성엔 깨끗하게.
 * 괄호 안 지시문, 마크다운 기호, 목록, 링크/이미지, 이모지를 제거한다.
 */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // 이미지
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // 링크 → 텍스트만
    .replace(/\([^)]*\)|（[^）]*）/g, " ") // (지시문)
    .replace(/\[[^\]]*\]|【[^】]*】/g, " ") // [지시문]
    .replace(/[*_`#>~|]/g, "") // 마크다운 기호
    .replace(/^\s*[-•·]\s+/gm, "") // 글머리 기호
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}]/gu, "") // 이모지/픽토그램
    .replace(/\s+/g, " ")
    .trim();
}

const SENTENCE_END = /([.!?…。！？]+["'”’)\]]?\s|\n+)/;

export class SentenceChunker {
  private buf = "";

  /** 델타를 누적하고, 완성된 문장들을 반환 */
  push(delta: string): string[] {
    this.buf += delta;
    const out: string[] = [];
    let m = this.buf.match(SENTENCE_END);
    while (m && m.index !== undefined) {
      const end = m.index + m[0].length;
      const sentence = this.buf.slice(0, end).trim();
      if (sentence) out.push(sentence);
      this.buf = this.buf.slice(end);
      m = this.buf.match(SENTENCE_END);
    }
    return out;
  }

  /** 스트림 종료 — 남은 텍스트 반환 */
  flush(): string {
    const rest = this.buf.trim();
    this.buf = "";
    return rest;
  }
}
