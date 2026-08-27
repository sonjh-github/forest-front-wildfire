import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAssetLogs } from "./device-log-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("device log API", () => {
  it("assetId와 기본 limit=20으로 첫 페이지를 조회한다", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain(
        "/api/v1/dashboard/assets/20000000-0000-4000-8000-000000000002/logs?limit=20",
      );

      expect(url).not.toContain("cursor=");

      return new Response(
        JSON.stringify({
          data: {
            assetId: "20000000-0000-4000-8000-000000000002",
            logs: [],
            page: {
              limit: 20,
              hasMore: false,
              nextCursor: null,
            },
          },
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await loadAssetLogs(
      "20000000-0000-4000-8000-000000000002",
    );

    expect(result.page.limit).toBe(20);
    expect(result.logs).toEqual([]);
  });

  it("다음 페이지 조회 시 cursor를 URL 인코딩하여 전달한다", async () => {
    const cursor = "2026-08-21T05:39:45.584576+00:00";

    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("limit=20");
      expect(url).toContain(
        "cursor=2026-08-21T05%3A39%3A45.584576%2B00%3A00",
      );

      return new Response(
        JSON.stringify({
          data: {
            assetId: "20000000-0000-4000-8000-000000000002",
            logs: [],
            page: {
              limit: 20,
              hasMore: false,
              nextCursor: null,
            },
          },
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    await loadAssetLogs(
      "20000000-0000-4000-8000-000000000002",
      { cursor },
    );
  });
});