export type TerrainEncoding = "terrarium" | "mapbox";

export type TerrainConfig = {
  tiles: string[];
  tileSize: 256 | 512;
  encoding: TerrainEncoding;
  maxzoom: number;
  attribution: string;
  resolutionLabel: string;
  sourceLabel: string;
};

export function resolveTerrainConfig(env: Record<string, string | undefined>): TerrainConfig {
  const customUrl = env.VITE_DEM_TILE_URL?.trim();
  const tileSize = Number(env.VITE_DEM_TILE_SIZE) === 512 ? 512 : 256;
  const encoding: TerrainEncoding = env.VITE_DEM_ENCODING?.toLowerCase() === "mapbox" ? "mapbox" : "terrarium";
  const maxzoomValue = Number(env.VITE_DEM_MAX_ZOOM);
  return {
    tiles: [customUrl || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
    tileSize,
    encoding,
    maxzoom: Number.isFinite(maxzoomValue) && maxzoomValue >= 8 && maxzoomValue <= 18 ? maxzoomValue : 15,
    attribution: env.VITE_DEM_ATTRIBUTION?.trim() || "DEM terrain",
    resolutionLabel: env.VITE_DEM_RESOLUTION_LABEL?.trim() || (customUrl ? "기관 DEM" : "공개 DEM"),
    sourceLabel: customUrl ? "실증지역 DEM" : "공개 DEM 대체자료",
  };
}


/** Bundled source metadata from public/dem/37806/README.txt; only WILDFIRE demo selects it. */
export const BONGPYEONG_DEM = {
  sourceId: "ngii-37806-2025",
  resolutionMeters: 90,
  sourceCrs: "EPSG:5179",
  bounds: [128.2461776, 37.4926055, 128.5082070, 37.7508433],
  tiles: ["/dem/37806/{z}/{x}/{y}.png"],
  tileSize: 256,
  encoding: "terrarium",
  maxzoom: 13,
  attribution: "국토지리정보원 공개DEM 37806 (2025)",
  resolutionLabel: "90m 공개DEM",
  sourceLabel: "평창 봉평 37806 실지형",
} satisfies TerrainConfig & { sourceId: string; resolutionMeters: number; sourceCrs: string; bounds: number[] };
