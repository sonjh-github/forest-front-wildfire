import { describe, expect, it } from "vitest";
import { createDemoOverview } from "./demoOverview";

describe("통합 관제 실증 데이터", () => {
  it("10개 요구영역의 지도 레이어와 KPI 증적을 제공한다", () => {
    const overview = createDemoOverview(new Date("2026-09-03T05:00:00Z"));
    for (const layer of ["firelines", "spread-predictions", "wildfire-risk-zones", "evacuation-routes", "suppression-resources", "water-sources", "nearby-response-resources", "slope-assessments", "slope-gradients", "viewsheds", "communication-shadows", "external-firms", "external-landslide-history"]) {
      expect(overview.domainLayers[layer]?.length, layer).toBeGreaterThan(0);
    }
    expect(overview.alerts.length).toBeGreaterThan(0);
    expect(overview.kpis.map((item) => item.metricCode)).toEqual(expect.arrayContaining(["LOCATION_LATENCY", "NETWORK_DEPLOYMENT_TIME", "SHARING_SUCCESS", "NETWORK_AVAILABILITY"]));
    expect(overview.kpis.every((item) => Array.isArray(item.evidence) && item.evidence.length > 0)).toBe(true);
  });

  it("MAVLink 모사 드론 위치와 임무가 시간에 따라 갱신된다", () => {
    const first = createDemoOverview(new Date("2026-09-03T05:00:00Z")).assets.find((item) => item.assetId === "DRONE-01")!;
    const second = createDemoOverview(new Date("2026-09-03T05:00:03Z")).assets.find((item) => item.assetId === "DRONE-01")!;
    expect(second.geometry).not.toEqual(first.geometry);
    expect((second.attributes as Record<string, unknown>).armed).toBe(true);
    expect((second.attributes as Record<string, unknown>).flightMode).toBe("AUTO");
  });
});
