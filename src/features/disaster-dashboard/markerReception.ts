export function markerReceptionState(receivedAt: string | undefined, observedAt: string, now: number) {
  const received = Date.parse(receivedAt || observedAt);
  return !Number.isFinite(received) || now - received >= 30_000 ? "OFFLINE" : "LIVE";
}
