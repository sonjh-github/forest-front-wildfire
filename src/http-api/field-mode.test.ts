import { afterEach, expect, it, vi } from "vitest";
import { forestApi, loadEventOverview } from "./forest-api";
import {
  createFieldPreviewOverview,
  fieldCoreStatusLabel,
  fieldEvent,
  fieldEventId,
  isFieldPreviewMode,
  isLocalFieldMode,
} from "./field-mode";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete (globalThis as { window?: unknown }).window;
});

it("field mode requires compile-time and query opt-in and rejects e2e overlap", () => {
  (globalThis as { window?: unknown }).window = { location: { search: "?field=1" } };
  vi.stubEnv("VITE_FIELD_MODE_ENABLED", "0");
  expect(isLocalFieldMode()).toBe(false);

  vi.stubEnv("VITE_FIELD_MODE_ENABLED", "1");
  expect(isLocalFieldMode()).toBe(true);

  (globalThis as { window?: unknown }).window = { location: { search: "?field=1&e2e=1" } };
  expect(isLocalFieldMode()).toBe(false);
});

it("field preview requires explicit preview=1 and remains inside field mode", () => {
  vi.stubEnv("VITE_FIELD_MODE_ENABLED", "1");
  (globalThis as { window?: unknown }).window = { location: { search: "?field=1" } };
  expect(isFieldPreviewMode()).toBe(false);

  (globalThis as { window?: unknown }).window = { location: { search: "?field=1&preview=1" } };
  expect(isLocalFieldMode()).toBe(true);
  expect(isFieldPreviewMode()).toBe(true);

  (globalThis as { window?: unknown }).window = { location: { search: "?field=1&preview=1&e2e=1" } };
  expect(isFieldPreviewMode()).toBe(false);
});

it("field overview uses local registry metadata but only real Core telemetry rows", async () => {
  vi.stubEnv("VITE_FIELD_MODE_ENABLED", "1");
  vi.stubEnv("VITE_FIELD_EVENT_ID", "field-test-event");
  (globalThis as { window?: unknown }).window = { location: { search: "?field=1" } };
  const now = new Date().toISOString();
  const assetsSpy = vi.spyOn(forestApi, "dashboardDisasterAssets");
  vi.spyOn(forestApi, "dashboardDroneTelemetry").mockResolvedValue({
    data: [{
      assetId: "MD1000-01",
      eventId: fieldEventId(),
      observedAt: now,
      receivedAt: now,
      latitude: 36.35,
      longitude: 127.38,
      altitude: 120,
      attributes: {
        mavlinkVersion: 2,
        systemId: 1,
        componentId: 1,
        sourceAddress: "127.0.0.1:64361",
      },
    }],
  });

  const result = await loadEventOverview(fieldEvent());
  expect(assetsSpy).not.toHaveBeenCalled();
  expect(result.event.eventId).toBe("field-test-event");
  expect(result.assets[0]).toMatchObject({
    assetId: "field-md1000-canonical-local",
    assetCode: "MD1000-01",
    sourceAssetId: "MD1000-01",
    geometry: { type: "Point", coordinates: [127.38, 36.35, 120] },
  });
  expect(result.liveDroneTelemetry).toEqual({
    status: "CONNECTED",
    matched: 1,
    unmatched: 0,
    live: 1,
    stale: 0,
    offline: 0,
  });
});

it("field preview supplies visible demo assets without reading Core telemetry", async () => {
  vi.stubEnv("VITE_FIELD_MODE_ENABLED", "1");
  (globalThis as { window?: unknown }).window = { location: { search: "?field=1&preview=1" } };
  const telemetrySpy = vi.spyOn(forestApi, "dashboardDroneTelemetry");

  const result = await loadEventOverview(fieldEvent());
  expect(telemetrySpy).not.toHaveBeenCalled();
  expect(result.event.eventName).toContain("미리보기");
  expect(result.assets.length).toBeGreaterThanOrEqual(5);
  expect(result.personnel.length).toBe(2);
  expect(result.networks.length).toBe(2);
  expect(result.kpis.length).toBe(4);
  expect(result.assets.find((asset) => asset.assetId === "MD1000-01")).toMatchObject({
    assetType: "UAV",
    previewOnly: true,
  });
  expect(result.liveDroneTelemetry).toEqual({
    status: "PREVIEW",
    matched: 1,
    unmatched: 0,
    live: 1,
    stale: 0,
    offline: 0,
  });
});

it("field preview generator marks every primary object as preview-only", () => {
  vi.stubEnv("VITE_FIELD_MODE_ENABLED", "1");
  (globalThis as { window?: unknown }).window = { location: { search: "?field=1&preview=1" } };
  const result = createFieldPreviewOverview(fieldEvent(), new Date("2026-09-12T05:00:00Z"));
  expect(result.assets.every((asset) => asset.previewOnly === true)).toBe(true);
  expect(result.networks.every((network) => network.previewOnly === true)).toBe(true);
  expect(result.kpis.every((kpi) => kpi.previewOnly === true)).toBe(true);
});

it("field Core status distinguishes reachable-empty from API failure", () => {
  expect(fieldCoreStatusLabel("CONNECTED", 0)).toBe("Core API 정상 · 실기체 위치 대기");
  expect(fieldCoreStatusLabel("CONNECTED", 1)).toBe("Core API 정상");
  expect(fieldCoreStatusLabel("UNAVAILABLE", 1)).toBe("Core API 재연결 중 · 마지막 유효 위치 유지");
  expect(fieldCoreStatusLabel("OTHER", 0)).toBe("Core API 상태 확인 중");
});
