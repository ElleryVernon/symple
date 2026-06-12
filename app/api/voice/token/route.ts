import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CARTESIA_VERSION = "2026-03-01";

/**
 * POST /api/voice/token
 * Cartesia 임시 access token 발급 — 클라이언트가 Cartesia WebSocket(STT/TTS)에
 * **직접** 연결하게 해 프록시 홉 없이 최저 레이턴시를 얻는다. API 키는 서버에만 둔다.
 */
export async function POST(req: Request) {
  const apiKey = process.env.CARTESIA_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({ error: "음성 기능이 설정되지 않았어요." }, { status: 503 });
  }

  // 토큰 발급은 곧 과금 가능 리소스 — 오버레이 열기 + 재연결 재발급을 감안해도 충분한 한도.
  // IP 식별 불가(프록시 없는 배포)면 공용 키로라도 총량을 막되 한도를 올려 집단 429 를 피한다.
  const ip = clientIp(req);
  if (!rateLimit(`voicetoken:${ip ?? "shared"}`, ip ? 20 : 60, 60_000)) {
    return Response.json(
      { error: "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요." },
      { status: 429 }
    );
  }

  try {
    const res = await fetch("https://api.cartesia.ai/access-token", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Cartesia-Version": CARTESIA_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grants: { tts: true, stt: true },
        expires_in: 600, // 10분 — 오버레이 열 때마다 재발급
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[voice] token mint failed:", res.status, t.slice(0, 200));
      return Response.json({ error: "음성 토큰 발급에 실패했어요." }, { status: 502 });
    }
    const { token } = (await res.json()) as { token: string };

    return Response.json(
      {
        token,
        version: CARTESIA_VERSION,
        stt: {
          model: process.env.CARTESIA_STT_MODEL?.trim() || "ink-whisper", // 한국어 지원
          language: "ko",
          sampleRate: 16000,
          encoding: "pcm_s16le",
        },
        tts: {
          model: process.env.CARTESIA_TTS_MODEL?.trim() || "sonic-3",
          voiceId:
            process.env.CARTESIA_VOICE_ID?.trim() ||
            "694f9389-aac1-45b6-b726-9d9369183238",
          language: "ko",
          sampleRate: 24000,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("[voice] token error:", e);
    return Response.json({ error: "음성 토큰 발급 중 오류가 발생했어요." }, { status: 502 });
  }
}
