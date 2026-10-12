import {
  classifySemanticMissionState,
  measureSemanticPacket,
  type SemanticMissionPacket,
  type SemanticMissionState,
} from "./semanticMission";

export type SemanticMissionSnapshot = {
  state: SemanticMissionState;
  packet: SemanticMissionPacket | null;
  packetAgeMs: number | null;
  packetBytes: number | null;
  sourceBytes: number | null;
  reductionRatio: number | null;
  experimental: true;
};

export function createSemanticMissionSnapshot(
  packet: SemanticMissionPacket | null,
  now: Date,
  staleAfterMs = 10_000,
): SemanticMissionSnapshot {
  if (packet == null) {
    return {
      state: "UNAVAILABLE",
      packet: null,
      packetAgeMs: null,
      packetBytes: null,
      sourceBytes: null,
      reductionRatio: null,
      experimental: true,
    };
  }

  const observedAtMs = Date.parse(packet.observedAt);
  const packetAgeMs = Number.isFinite(observedAtMs)
    ? Math.max(0, now.getTime() - observedAtMs)
    : null;

  const metrics = measureSemanticPacket(packet);

  return {
    state: classifySemanticMissionState(packet, now, staleAfterMs),
    packet,
    packetAgeMs,
    packetBytes: metrics.packetBytes,
    sourceBytes: metrics.sourceBytes,
    reductionRatio: metrics.reductionRatio,
    experimental: true,
  };
}