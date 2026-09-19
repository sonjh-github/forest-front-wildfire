export type FieldApiHealthState =
  | "ONLINE"
  | "DEGRADED"
  | "OFFLINE"
  | "RECOVERING";

type EvaluateFieldApiHealthInput = {
  lastSuccessAt: Date | string | null;
  failedIntegrations: number;
  totalIntegrations: number;
  retrying?: boolean;
  now?: number;
  staleAfterMs?: number;
  offlineAfterMs?: number;
};

export function evaluateFieldApiHealth({
  lastSuccessAt,
  failedIntegrations,
  totalIntegrations,
  retrying = false,
  now = Date.now(),
  staleAfterMs = 5_000,
  offlineAfterMs = 15_000,
}: EvaluateFieldApiHealthInput): FieldApiHealthState {
  if (retrying) return "RECOVERING";

  if (!lastSuccessAt) {
    return failedIntegrations > 0 ? "OFFLINE" : "DEGRADED";
  }

  const timestamp =
    lastSuccessAt instanceof Date
      ? lastSuccessAt.getTime()
      : new Date(lastSuccessAt).getTime();

  if (!Number.isFinite(timestamp)) return "DEGRADED";

  const age = Math.max(0, now - timestamp);

  if (age >= offlineAfterMs) return "OFFLINE";
  if (age >= staleAfterMs) return "DEGRADED";
  if (totalIntegrations > 0 && failedIntegrations > 0) return "DEGRADED";

  return "ONLINE";
}

export function fieldApiHealthLabel(state: FieldApiHealthState): string {
  switch (state) {
    case "ONLINE":
      return "관제 API 정상";
    case "DEGRADED":
      return "일부 연결 지연";
    case "OFFLINE":
      return "관제 API 연결 지연";
    case "RECOVERING":
      return "재연결 중";
  }
}

export function formatLastSuccessAge(
  lastSuccessAt: Date | string | null,
  now = Date.now(),
): string {
  if (!lastSuccessAt) return "정상 수신 기록 없음";

  const timestamp =
    lastSuccessAt instanceof Date
      ? lastSuccessAt.getTime()
      : new Date(lastSuccessAt).getTime();

  if (!Number.isFinite(timestamp)) return "정상 수신 시각 확인 불가";

  const seconds = Math.max(0, Math.floor((now - timestamp) / 1_000));

  if (seconds < 2) return "방금 정상 수신";
  if (seconds < 60) return `마지막 정상 수신 ${seconds}초 전`;

  return `마지막 정상 수신 ${Math.floor(seconds / 60)}분 전`;
}
