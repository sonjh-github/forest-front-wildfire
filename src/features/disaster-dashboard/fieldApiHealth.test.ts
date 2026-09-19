import { describe, expect, it } from "vitest";
import {
  evaluateFieldApiHealth,
  fieldApiHealthLabel,
  formatLastSuccessAge,
} from "./fieldApiHealth";

describe("field API health", () => {
  const now = Date.parse("2026-09-19T03:00:20.000Z");

  it("reports ONLINE for fresh successful reception", () => {
    expect(evaluateFieldApiHealth({
      lastSuccessAt: "2026-09-19T03:00:19.000Z",
      failedIntegrations: 0,
      totalIntegrations: 5,
      now,
    })).toBe("ONLINE");
  });

  it("reports DEGRADED when an external integration fails", () => {
    expect(evaluateFieldApiHealth({
      lastSuccessAt: "2026-09-19T03:00:19.000Z",
      failedIntegrations: 1,
      totalIntegrations: 5,
      now,
    })).toBe("DEGRADED");
  });

  it("reports DEGRADED when reception is stale", () => {
    expect(evaluateFieldApiHealth({
      lastSuccessAt: "2026-09-19T03:00:10.000Z",
      failedIntegrations: 0,
      totalIntegrations: 5,
      now,
    })).toBe("DEGRADED");
  });

  it("reports OFFLINE after the offline threshold", () => {
    expect(evaluateFieldApiHealth({
      lastSuccessAt: "2026-09-19T03:00:00.000Z",
      failedIntegrations: 5,
      totalIntegrations: 5,
      now,
    })).toBe("OFFLINE");
  });

  it("reports RECOVERING while retrying", () => {
    expect(evaluateFieldApiHealth({
      lastSuccessAt: "2026-09-19T03:00:00.000Z",
      failedIntegrations: 5,
      totalIntegrations: 5,
      retrying: true,
      now,
    })).toBe("RECOVERING");
  });

  it("uses operator-facing labels and reception age", () => {
    expect(fieldApiHealthLabel("ONLINE")).toBe("관제 API 정상");
    expect(fieldApiHealthLabel("DEGRADED")).toBe("일부 연결 지연");
    expect(fieldApiHealthLabel("OFFLINE")).toBe("관제 API 연결 지연");
    expect(fieldApiHealthLabel("RECOVERING")).toBe("재연결 중");

    expect(formatLastSuccessAge(
      "2026-09-19T03:00:00.000Z",
      Date.parse("2026-09-19T03:00:42.000Z"),
    )).toBe("마지막 정상 수신 42초 전");
  });
});
