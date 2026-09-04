import { describe, expect, it } from "vitest";
import { createDemoOverview } from "./demoOverview";
import { mergeTelemetryIntoOverview, parseTelemetryMessage } from "./telemetryStream";

describe("Gateway telemetry stream", () => {
  it("Gateway 좌표 메시지를 표준 텔레메트리로 검증한다", () => {
    const message = parseTelemetryMessage(JSON.stringify({ data: { assetId: "DRONE-01", eventId: "demo-wildfire-pyeongchang", observedAt: "2026-09-04T01:00:00Z", lat: 37.62, lng: 128.37, sequence: 10, positioningMethod: "RTK_FIXED" } }));
    expect(message).toMatchObject({ assetId: "DRONE-01", latitude: 37.62, longitude: 128.37, sequence: 10 });
  });

  it("잘못된 좌표·시각 메시지를 폐기한다", () => {
    expect(parseTelemetryMessage({ assetId: "A", observedAt: "invalid", latitude: 91, longitude: 128 })).toBeNull();
  });

  it("최신 스트림 좌표를 assetId 기준으로 overview에 병합한다", () => {
    const overview = createDemoOverview(new Date("2026-09-04T00:00:00Z"), "WILDFIRE");
    const message = parseTelemetryMessage({ assetId: "DRONE-01", eventId: overview.event.eventId, observedAt: "2026-09-04T00:00:03Z", latitude: 37.625, longitude: 128.375, altitude: 330, sequence: 2 })!;
    const merged = mergeTelemetryIntoOverview(overview, message);
    expect((merged.assets.find((asset) => asset.assetId === "DRONE-01")?.geometry as { coordinates: number[] }).coordinates).toEqual([128.375, 37.625, 330]);
    expect(merged.assets.find((asset) => asset.assetId === "DRONE-01")?.sourceSystem).toBe("GATEWAY_STREAM");
  });
});
