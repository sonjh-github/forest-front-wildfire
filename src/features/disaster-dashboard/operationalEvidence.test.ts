import { describe, expect, it } from "vitest";
import { buildOperationalEvidence, calculateTelemetryMetrics, classifyLinkHealth, evaluateRiskZone } from "./operationalEvidence";

const sample = (sequence: number, second: number, latencyMs = 200) => ({
  assetId: "DRONE-01", sequence,
  observedAt: new Date(Date.UTC(2026, 8, 4, 0, 0, second)).toISOString(),
  receivedAt: new Date(Date.UTC(2026, 8, 4, 0, 0, second, latencyMs)).toISOString(),
  latitude: 37.61, longitude: 128.36,
});

describe("operational evidence", () => {
  it("수신시각과 목표주기로 연결·지연·두절을 판정한다", () => {
    const now = new Date("2026-09-04T00:00:10Z");
    expect(classifyLinkHealth("2026-09-04T00:00:08Z", now)).toBe("CONNECTED");
    expect(classifyLinkHealth("2026-09-04T00:00:05Z", now)).toBe("DELAYED");
    expect(classifyLinkHealth("2026-09-04T00:00:00Z", now)).toBe("DISCONNECTED");
  });

  it("원시 텔레메트리에서 지연·가용률·공유성공률을 계산한다", () => {
    const metrics = calculateTelemetryMetrics([sample(1, 0), sample(2, 3, 400), sample(3, 6)], 3);
    expect(metrics.averageLatencySec).toBeCloseTo(0.267, 3);
    expect(metrics.maxGapSec).toBe(3);
    expect(metrics.availabilityPct).toBe(100);
    expect(metrics.sharingSuccessPct).toBe(100);
  });

  it("시험 실행 ID·원시표본·무결성값을 포함한 증적을 만든다", () => {
    const evidence = buildOperationalEvidence({ eventId: "WF-1", runId: "run-1", samples: [sample(1, 0)], startedAt: "2026-09-04T00:00:00Z", networkReadyAt: "2026-09-04T00:06:24Z" });
    expect(evidence.schemaVersion).toBe("forest-kpi-evidence/v1");
    expect(evidence.metrics.networkDeploymentMinutes).toBe(6.4);
    expect(evidence.integrity.checksum).toMatch(/^fnv1a-/);
    expect(evidence.rawSamples).toHaveLength(1);
  });

  it("현장 좌표의 위험구역 진입 여부를 공간 판정한다", () => {
    const zone: [number, number][] = [[128.35, 37.60], [128.38, 37.60], [128.38, 37.63], [128.35, 37.63]];
    expect(evaluateRiskZone([128.37, 37.61], zone).inside).toBe(true);
    expect(evaluateRiskZone([128.40, 37.65], zone).shouldAlert).toBe(false);
  });
});
