import { afterEach, describe, expect, it, vi } from "vitest";
import {
  forestApi,
  loadDashboardDisasterAssetsCached,
} from "./forest-api";

function response(disasterId: string, assetCount: number) {
  return {
    data: {
      disaster: { disasterId },
      assetCount,
      assets: [],
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("dashboard disaster asset cache", () => {
  it("reuses the fresh response without another API request", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T00:00:00Z"));

    const disasterId = "cache-fresh-test";
    const first = response(disasterId, 1);

    const api = vi
      .spyOn(forestApi, "dashboardDisasterAssets")
      .mockResolvedValue(first);

    await expect(
      loadDashboardDisasterAssetsCached(disasterId),
    ).resolves.toEqual(first);

    vi.advanceTimersByTime(5_000);

    await expect(
      loadDashboardDisasterAssetsCached(disasterId),
    ).resolves.toEqual(first);

    expect(api).toHaveBeenCalledTimes(1);
  });

  it("refreshes the snapshot after the fresh TTL expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T00:10:00Z"));

    const disasterId = "cache-refresh-test";
    const first = response(disasterId, 1);
    const second = response(disasterId, 2);

    const api = vi
      .spyOn(forestApi, "dashboardDisasterAssets")
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);

    await expect(
      loadDashboardDisasterAssetsCached(disasterId),
    ).resolves.toEqual(first);

    vi.advanceTimersByTime(10_001);

    await expect(
      loadDashboardDisasterAssetsCached(disasterId),
    ).resolves.toEqual(second);

    expect(api).toHaveBeenCalledTimes(2);
  });

  it("returns the last successful snapshot when refresh temporarily fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T00:20:00Z"));

    const disasterId = "cache-stale-test";
    const first = response(disasterId, 1);

    const api = vi
      .spyOn(forestApi, "dashboardDisasterAssets")
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error("temporary outage"));

    await expect(
      loadDashboardDisasterAssetsCached(disasterId),
    ).resolves.toEqual(first);

    vi.advanceTimersByTime(10_001);

    await expect(
      loadDashboardDisasterAssetsCached(disasterId),
    ).resolves.toEqual(first);

    expect(api).toHaveBeenCalledTimes(2);
  });

  it("rejects when the successful snapshot is outside the stale window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T00:30:00Z"));

    const disasterId = "cache-expired-test";
    const first = response(disasterId, 1);

    const api = vi
      .spyOn(forestApi, "dashboardDisasterAssets")
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error("asset API unavailable"));

    await expect(
      loadDashboardDisasterAssetsCached(disasterId),
    ).resolves.toEqual(first);

    vi.advanceTimersByTime(40_001);

    await expect(
      loadDashboardDisasterAssetsCached(disasterId),
    ).rejects.toThrow("asset API unavailable");

    expect(api).toHaveBeenCalledTimes(2);
  });

  it("rejects an initial failure instead of inventing empty asset data", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T00:40:00Z"));

    const disasterId = "cache-initial-failure-test";

    const api = vi
      .spyOn(forestApi, "dashboardDisasterAssets")
      .mockRejectedValue(new Error("initial asset API failure"));

    await expect(
      loadDashboardDisasterAssetsCached(disasterId),
    ).rejects.toThrow("initial asset API failure");

    expect(api).toHaveBeenCalledTimes(1);
  });
});