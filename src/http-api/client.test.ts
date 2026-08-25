import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpApiError, httpApi } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("httpApi", () => {
  it("API 기준 주소, 호출 출처와 JSON Content-Type을 적용한다", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      expect(headers.get("X-Origin")).toBe("forest-front-demo");
      expect(headers.get("Content-Type")).toBe("application/json");
      return new Response(JSON.stringify({ data: { accepted: true } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(httpApi("/api/v1/events", { method: "POST", body: "{}" })).resolves.toEqual({ data: { accepted: true } });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/v1\/events$/);
  });

  it("204 응답을 null로 처리한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    await expect(httpApi("/empty")).resolves.toBeNull();
  });

  it("구조화된 API 오류를 HttpApiError로 전달한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "권한 없음" } }), { status: 403 })));
    try {
      await httpApi("/forbidden");
      expect.fail("오류가 발생해야 한다");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpApiError);
      expect((error as HttpApiError).status).toBe(403);
      expect((error as Error).message).toBe("권한 없음");
    }
  });

  it("JSON이 아닌 오류 응답도 상태 코드로 표현한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad gateway", { status: 502 })));
    await expect(httpApi("/broken")).rejects.toMatchObject({ status: 502, message: "HTTP 502" });
  });
});
