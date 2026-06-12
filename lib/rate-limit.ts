/**
 * 인스턴스 로컬 슬라이딩 윈도 레이트리미터.
 * 단일 인스턴스 배포 기준 — 수평 확장 시 Redis 등 공유 스토어로 교체해야 한다.
 */

const buckets = new Map<string, number[]>();
const MAX_BUCKETS = 10_000; // 메모리 가드
const SWEEP_INTERVAL_MS = 60_000; // 전수 스캔은 비싸다 — 분당 1회로 상각
let lastSweep = 0;

/** 클라이언트 uid 형식(crypto.randomUUID 또는 timestamp-random) — 사용자 식별자 1차 검증 */
export const EXTERNAL_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;

/** windowMs 안에 limit 회를 넘으면 false (요청 거부) */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);

  if (buckets.size > MAX_BUCKETS && now - lastSweep > SWEEP_INTERVAL_MS) {
    lastSweep = now;
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
    // 만료된 게 없어도(스푸핑된 키 무한 생성 등) 한도는 지킨다 — 삽입순 강제 퇴출
    while (buckets.size > MAX_BUCKETS) {
      const oldest = buckets.keys().next().value;
      if (oldest === undefined) break;
      buckets.delete(oldest);
    }
  }
  return true;
}

/**
 * 프록시 뒤에서의 클라이언트 IP. 식별 불가 시 null — 호출부는 IP 한도를 건너뛰거나
 * 별도 키를 쓴다. ("unknown" 같은 공용 키로 합치면 전 사용자가 버킷 하나를 나눠 쓰며
 * 집단 429 가 난다. x-forwarded-for 는 신뢰 가능한 프록시 뒤에서만 의미가 있다.)
 */
export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || null;
}
