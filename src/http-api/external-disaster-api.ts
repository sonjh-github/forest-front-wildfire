import { httpApi } from "./client";

export interface ExternalListMeta {
  pageNo?: number;
  numOfRows?: number;
  totalCount?: number;
  count: number;
  provider: string;
}

export interface ExternalListResponse<T> {
  data: T[];
  meta: ExternalListMeta;
}

export interface FirmsHotspot {
  latitude: number;
  longitude: number;
  brightness?: number;
  scan?: number;
  track?: number;
  acquiredAt?: string;
  satellite?: string;
  confidence?: string | number;
  version?: string;
  brightT31?: number;
  frp?: number;
  daynight?: string;
}

export interface WildfireRisk {
  analyzedAt: string;
  area: string;
  province: string;
  district: string;
  regionCode: string;
  sigunguCode: string;
  max: number | null;
  min: number | null;
  mean: number | null;
  std: number | null;
  d1: number | null;
  d2: number | null;
  d3: number | null;
  d4: number | null;
}

export interface LandslideForecast {
  predictedAt: string;
  district: string;
  forecast: string;
}

export interface LandslideHistory {
  occurredDate: string;
  x: number;
  y: number;
  serialNumber: number;
  disasterName: string;
  geometry: string;
  address: string;
  provinceCode: string;
  sigunguCode: string;
  eupMyeonDongCode: string;
}

export interface LandslideRegionalRisk {
  managementNumber: string;
  districtName: string;
  detailAddress: string;
  standardDistrictCode: string;
  forestClassificationCode: string;
  slopePropertyCode: string;
  riskGradeCode: string;
  riskGradeTypeCode: string;
  recentLandslideDate: string;
  lastModifiedAt: string;
  dailyExpectedRainfall: number;
  hourlyExpectedRainfall: number;
  expectedPeople: number;
  expectedHouseholds: number;
  expectedBuildings: number;
  expectedFarmlandArea: number;
  expectedLandslideArea: number;
  drainageWidth: number;
  drainageHeight: number;
  drainageLength: number;
  shelterName1: string;
  shelterPhone1: string;
  shelterName2: string;
  shelterPhone2: string;
  responsibleDepartment: string;
  responsiblePosition: string;
  citizenOrganization: string;
  citizenPosition: string;
  popularPlaceName: string;
}

export const externalDisasterApi = {
  wildfireFirms: () =>
    httpApi<ExternalListResponse<FirmsHotspot>>(
      "/api/v1/external/wildfire/firms"
    ),

  wildfireRisk: (pageNo = 1, numOfRows = 100) =>
    httpApi<ExternalListResponse<WildfireRisk>>(
      `/api/v1/external/wildfire/risk?pageNo=${pageNo}&numOfRows=${numOfRows}`
    ),

  landslideForecast: (pageNo = 1, numOfRows = 100) =>
    httpApi<ExternalListResponse<LandslideForecast>>(
      `/api/v1/external/landslide/forecast?pageNo=${pageNo}&numOfRows=${numOfRows}`
    ),

  landslideHistory: (pageNo = 1, numOfRows = 100) =>
    httpApi<ExternalListResponse<LandslideHistory>>(
      `/api/v1/external/landslide/history?pageNo=${pageNo}&numOfRows=${numOfRows}`
    ),

  landslideRegionalRisk: (pageNo = 1, numOfRows = 100) =>
    httpApi<ExternalListResponse<LandslideRegionalRisk>>(
      `/api/v1/external/landslide/regional-risk?pageNo=${pageNo}&numOfRows=${numOfRows}`
    ),
};
