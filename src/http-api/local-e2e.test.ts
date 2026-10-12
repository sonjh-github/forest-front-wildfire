import { afterEach, expect, it, vi } from "vitest";
import { forestApi, loadEventOverview } from "./forest-api";
import { LOCAL_E2E_EVENT, LOCAL_E2E_EVENT_ID, isLocalE2EMode } from "./local-e2e";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete (globalThis as { window?: unknown }).window;
});

it("local E2E mode requires both compile-time opt-in and query opt-in", () => {
  (globalThis as { window?: unknown }).window = { location: { search: "?e2e=1" } };

  // Do not depend on the parent process environment. RUN_LOCAL_BROWSER_E2E
  // intentionally builds with the opt-in enabled, while this unit test must
  // still prove that the compile-time gate can be disabled.
  vi.stubEnv("VITE_LOCAL_E2E_ENABLED", "0");
  expect(isLocalE2EMode()).toBe(false);

  vi.stubEnv("VITE_LOCAL_E2E_ENABLED", "1");
  expect(isLocalE2EMode()).toBe(true);

  (globalThis as { window?: unknown }).window = { location: { search: "" } };
  expect(isLocalE2EMode()).toBe(false);
});

it("local E2E video channel exposes the synthetic MD1000 RTSP fixture only for the canonical asset", async () => {
  vi.stubEnv("VITE_LOCAL_E2E_ENABLED", "1");
  (globalThis as { window?: unknown }).window = { location: { search: "?e2e=1" } };

  const result = await forestApi.videoChannels("e2e-md1000-canonical-uuid");

  expect(result.data).toHaveLength(1);
  expect(result.data[0]).toMatchObject({
    videoChannelId: "e2e-md1000-main-video",
    assetId: "e2e-md1000-canonical-uuid",
    streamUri: "rtsp://127.0.0.1:8554/md1000",
    enabled: true,
    verificationStatus: "REACHABLE",
    synthetic: true,
  });

  const unrelated = await forestApi.videoChannels("different-asset");
  expect(unrelated.data).toEqual([]);
});

it("local E2E overview uses fixture registration but real Core telemetry rows", async () => {
  vi.stubEnv("VITE_LOCAL_E2E_ENABLED", "1");
  (globalThis as { window?: unknown }).window = { location: { search: "?e2e=1" } };
  const now = new Date().toISOString();
  const assetsSpy = vi.spyOn(forestApi, "dashboardDisasterAssets");
  vi.spyOn(forestApi, "dashboardDroneTelemetry").mockResolvedValue({
    data: [{
      assetId: "MD1000-01",
      eventId: LOCAL_E2E_EVENT_ID,
      observedAt: now,
      receivedAt: now,
      latitude: 37.55,
      longitude: 128.4,
      altitude: 123,
      verticalSpeedMps: 1.5,
      mavlinkVersion: 2,
    }],
  });

  const result = await loadEventOverview(LOCAL_E2E_EVENT);
  expect(assetsSpy).not.toHaveBeenCalled();
  expect(result.event.eventId).toBe(LOCAL_E2E_EVENT_ID);
  expect(result.assets[0]).toMatchObject({
    assetId: "e2e-md1000-canonical-uuid",
    assetCode: "MD1000-01",
    sourceAssetId: "MD1000-01",
    geometry: { type: "Point", coordinates: [128.4, 37.55, 123] },
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
