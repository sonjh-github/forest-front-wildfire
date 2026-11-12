export const CHUNGNAM_VIEWSHED_CONFIG = {
  provider: "충남대학교",
  nodeId: "0486",
  routeName: "등산로_Clip",
  crsName: "Korea_2000_Central_Belt_2010",
  cellSizeM: 5,
  tvws: {
    layerId: "chungnam-tvws",
    label: "TVWS 가시권",
    url: "/chungnam-viewshed/tvws.tif",
    analysisRadiusM: 2500,
    antennaHeightM: 3.0,
  },
  term: {
    layerId: "chungnam-term",
    label: "단말 분석영역",
    url: "/chungnam-viewshed/term.tif",
    analysisRadiusM: 2000,
    antennaHeightM: 1.45,
  },
} as const;
