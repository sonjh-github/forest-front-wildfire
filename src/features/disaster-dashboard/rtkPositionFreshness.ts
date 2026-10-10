// 20261010 RTK 관측 최신성 표시
// 60초는 로컬 검증용 임시 기준이며 운영 성능 보증값이 아니다.
export const RTK_STALE_AFTER_MS = 60_000;

export function rtkPositionFetchStatus(
  observedAt: string,
  fetchFailed: boolean,
  hasLastKnownPosition: boolean,
  nowMs = Date.now(),
  staleAfterMs = RTK_STALE_AFTER_MS,
): string {
  if (!hasLastKnownPosition) {
    return "위치 확인 불가";
  }

  if (fetchFailed) {
    return "조회 실패 · 마지막 확인 위치";
  }

  const observedMs = Date.parse(observedAt);

  if (!Number.isFinite(observedMs)) {
    return "관측 시각 확인 불가";
  }

  const ageMs = nowMs - observedMs;

  if (ageMs < 0) {
    return "관측 시각 확인 필요 · 미래 시각";
  }

  if (ageMs >= staleAfterMs) {
    return "STALE · 마지막 관측 위치";
  }

  return "조회 성공 · 최근 관측";
}
