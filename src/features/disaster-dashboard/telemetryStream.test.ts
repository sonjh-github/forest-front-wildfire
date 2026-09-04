import { describe, expect, it } from "vitest";
import { createDemoOverview } from "./demoOverview";
import { MavlinkTelemetryAccumulator, applyTelemetrySafetyRules, isTelemetryStreamStale, mergeTelemetryIntoOverview, parseTelemetryMessage } from "./telemetryStream";

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

  it("대원 RTK 스트림을 personExternalId 기준으로 갱신한다", () => {
    const overview = createDemoOverview(new Date("2026-09-04T00:00:00Z"), "WILDFIRE");
    const message = parseTelemetryMessage({ entityType: "PERSONNEL", assetId: "CREW-12", eventId: overview.event.eventId, observedAt: "2026-09-04T00:00:03Z", latitude: 37.617, longitude: 128.374, positioningMethod: "RTK_FIXED", horizontalAccuracyM: 0.05 })!;
    const merged = mergeTelemetryIntoOverview(overview, message);
    const person = merged.personnel.find((row) => row.personExternalId === "CREW-12")!;
    expect((person.geometry as { coordinates: number[] }).coordinates.slice(0, 2)).toEqual([128.374, 37.617]);
    expect(person.positioningMethod).toBe("RTK_FIXED");
  });

  it("MAVLink heartbeat·GPS·위치 프레임을 하나의 드론 상태로 합친다", () => {
    const mavlink = new MavlinkTelemetryAccumulator();
    expect(mavlink.push({ protocol: "MAVLINK", assetId: "DRONE-01", observedAt: "2026-09-04T01:00:00Z", message: { type: "HEARTBEAT", base_mode: 128, flightMode: "AUTO" } })).toBeNull();
    expect(mavlink.push({ protocol: "MAVLINK", assetId: "DRONE-01", observedAt: "2026-09-04T01:00:01Z", message: { type: "GPS_RAW_INT", fix_type: 6, eph: 4, satellites_visible: 18 } })).toBeNull();
    const result = mavlink.push({ protocol: "MAVLINK", assetId: "DRONE-01", eventId: "WF-1", observedAt: "2026-09-04T01:00:02Z", sequence: 3, message: { type: "GLOBAL_POSITION_INT", lat: 376200000, lon: 1283700000, relative_alt: 312000, hdg: 9450, vx: 300, vy: 400 } });
    expect(result).toMatchObject({ assetId: "DRONE-01", latitude: 37.62, longitude: 128.37, altitude: 312, positioningMethod: "RTK_FIXED", operationalStatus: "FLYING" });
    expect(result?.attributes).toMatchObject({ armed: true, flightMode: "AUTO", headingDeg: 94.5, groundSpeedMps: 5, satellitesVisible: 18 });
  });

  it("실시간 위치가 위험면에 진입하면 관제 경보를 자동 발령한다", () => {
    const overview = createDemoOverview(new Date("2026-09-04T00:00:00Z"), "WILDFIRE");
    const updated = applyTelemetrySafetyRules(overview, { assetId: "DRONE-01", eventId: overview.event.eventId, observedAt: "2026-09-04T00:00:03Z", receivedAt: "2026-09-04T00:00:03Z", latitude: 37.615, longitude: 128.37 });
    expect(updated.alerts.find((alert) => alert.alertId === "ALT-GEOFENCE-DRONE-01")).toMatchObject({ status: "ACTIVE", severity: "CRITICAL", issuerOrgCode: "공간판정 엔진" });
  });

  it("소켓이 열려 있어도 10초 이상 메시지가 없으면 수신 중단으로 판정한다", () => {
    expect(isTelemetryStreamStale(1_000, 10_500)).toBe(false);
    expect(isTelemetryStreamStale(1_000, 11_001)).toBe(true);
  });
});
