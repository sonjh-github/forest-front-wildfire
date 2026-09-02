import { dashboardApi, HttpApiError } from "./client";

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

export function externalIntegrationErrorMessage(
  error: unknown,
): string {
  if (error instanceof HttpApiError) {
    const message = error.message;

    if (
      /UNREGISTERED IP|등록되지 않은 IP/i.test(message)
    ) {
      return "외부기관 서버 접근 허용(IP 등록) 확인 필요";
    }

    if (
      error.status === 401 ||
      error.status === 403 ||
      /HTTP 401|HTTP 403|UNAUTHORIZED|FORBIDDEN|SERVICE[_ ]?KEY/i.test(message)
    ) {
      return "외부기관 API 인증·권한 확인 필요";
    }

    if (error.status >= 500) {
      return "외부기관 응답 오류";
    }

    return "외부기관 API 요청 실패";
  }

  if (
    error instanceof TypeError ||
    (
      error instanceof Error &&
      /FAILED TO FETCH|NETWORK/i.test(error.message)
    )
  ) {
    return "외부기관 응답 없음 또는 네트워크 연결 확인 필요";
  }

  return "외부기관 연계 상태 확인 필요";
}

async function externalRequest<T>(
  request: () => Promise<T>,
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw new Error(
      externalIntegrationErrorMessage(error),
    );
  }
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
    externalRequest(() =>
      dashboardApi<ExternalListResponse<FirmsHotspot>>(
        "/api/v1/external/wildfire/firms"
      )
    ),

  wildfireRisk: (pageNo = 1, numOfRows = 100) =>
    externalRequest(() =>
      dashboardApi<ExternalListResponse<WildfireRisk>>(
        `/api/v1/external/wildfire/risk?pageNo=${pageNo}&numOfRows=${numOfRows}`
      )
    ),

  landslideForecast: (pageNo = 1, numOfRows = 100) =>
    externalRequest(() =>
      dashboardApi<ExternalListResponse<LandslideForecast>>(
        `/api/v1/external/landslide/forecast?pageNo=${pageNo}&numOfRows=${numOfRows}`
      )
    ),

  landslideHistory: (pageNo = 1, numOfRows = 100) =>
    externalRequest(() =>
      dashboardApi<ExternalListResponse<LandslideHistory>>(
        `/api/v1/external/landslide/history?pageNo=${pageNo}&numOfRows=${numOfRows}`
      )
    ),

  landslideRegionalRisk: (pageNo = 1, numOfRows = 100) =>
    externalRequest(() =>
      dashboardApi<ExternalListResponse<LandslideRegionalRisk>>(
        `/api/v1/external/landslide/regional-risk?pageNo=${pageNo}&numOfRows=${numOfRows}`
      )
    ),
};
