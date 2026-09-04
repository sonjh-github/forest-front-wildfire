import { describe, expect, it } from "vitest";
import { resolveTerrainConfig } from "./terrainConfig";

describe("DEM terrain config", () => {
  it("기관 DEM 타일 규격을 환경설정으로 교체한다", () => {
    expect(resolveTerrainConfig({ VITE_DEM_TILE_URL: "https://dem.example/{z}/{x}/{y}.png", VITE_DEM_TILE_SIZE: "512", VITE_DEM_ENCODING: "mapbox", VITE_DEM_MAX_ZOOM: "17", VITE_DEM_RESOLUTION_LABEL: "5m 격자" })).toMatchObject({ tileSize: 512, encoding: "mapbox", maxzoom: 17, resolutionLabel: "5m 격자", sourceLabel: "실증지역 DEM" });
  });

  it("기관 설정이 없으면 공개 DEM을 대체자료로 명시한다", () => {
    const config = resolveTerrainConfig({});
    expect(config.tiles[0]).toContain("elevation-tiles-prod");
    expect(config.sourceLabel).toBe("공개 DEM 대체자료");
  });
});
