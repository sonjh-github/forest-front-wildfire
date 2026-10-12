import type { LinkHealth } from "./operationalEvidence";
import {
  isSemanticMissionPacketValid,
  type SemanticMissionPacket,
  type SemanticMissionState,
} from "./semanticMission";
import { createSemanticMissionSnapshot } from "./semanticMissionSnapshot";

export type SemanticFallbackMode =
  | "LIVE"
  | "DEGRADED"
  | "SEMANTIC_POC"
  | "UNAVAILABLE";

export type SemanticFallbackDecision = {
  mode: SemanticFallbackMode;
  linkHealth: LinkHealth;
  semanticState: SemanticMissionState;
  packet: SemanticMissionPacket | null;
  experimental: true;
  mock: boolean;
  predicted: boolean;
  reason: string;
};

export function decideSemanticFallback(
  linkHealth: LinkHealth,
  packet: SemanticMissionPacket | null,
  now: Date,
  staleAfterMs = 10_000,
): SemanticFallbackDecision {
  const validPacket =
    packet != null && isSemanticMissionPacketValid(packet)
      ? packet
      : null;

  const snapshot = createSemanticMissionSnapshot(
    validPacket,
    now,
    staleAfterMs,
  );

  if (linkHealth === "CONNECTED") {
    return {
      mode: "LIVE",
      linkHealth,
      semanticState: snapshot.state,
      packet: validPacket,
      experimental: true,
      mock: validPacket?.source === "MOCK",
      predicted: false,
      reason: "통신 연결 정상 · LIVE 유지",
    };
  }

  if (linkHealth === "DELAYED") {
    return {
      mode: "DEGRADED",
      linkHealth,
      semanticState: snapshot.state,
      packet: validPacket,
      experimental: true,
      mock: validPacket?.source === "MOCK",
      predicted: false,
      reason: "통신 지연 감지 · DEGRADED 유지",
    };
  }

  if (validPacket != null && snapshot.state === "RECEIVING") {
    return {
      mode: "SEMANTIC_POC",
      linkHealth,
      semanticState: snapshot.state,
      packet: validPacket,
      experimental: true,
      mock: validPacket.source === "MOCK",
      predicted: true,
      reason: "통신 단절 · 최신 유효 Semantic Mission PoC 데이터 사용",
    };
  }

  return {
    mode: "UNAVAILABLE",
    linkHealth,
    semanticState: snapshot.state,
    packet: validPacket,
    experimental: true,
    mock: validPacket?.source === "MOCK",
    predicted: false,
    reason: "통신 단절 · 사용 가능한 최신 Semantic Mission PoC 데이터 없음",
  };
}
