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
