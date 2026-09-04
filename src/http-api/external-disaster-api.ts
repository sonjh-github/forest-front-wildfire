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

export function validateExternalListResponse<T>(value: unknown, provider: string): ExternalListResponse<T> {
  if (!value || typeof value !== "object") throw new Error(`${provider} 응답 형식 확인 필요`);
  const candidate = value as { data?: unknown; meta?: Partial<ExternalListMeta> };
  if (!Array.isArray(candidate.data)) throw new Error(`${provider} 목록 데이터 형식 확인 필요`);
  const meta = candidate.meta ?? {};
  const count = Number(meta.count ?? candidate.data.length);
  if (!Number.isFinite(count) || count < 0) throw new Error(`${provider} 응답 건수 확인 필요`);
  return { data: candidate.data as T[], meta: { ...meta, count, provider: String(meta.provider ?? provider) } };
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

async function externalListRequest<T>(provider: string, path: string) {
  return validateExternalListResponse<T>(await externalRequest(() => dashboardApi<unknown>(path)), provider);
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
    externalListRequest<FirmsHotspot>("NASA FIRMS", "/api/v1/external/wildfire/firms"),

  wildfireRisk: (pageNo = 1, numOfRows = 100) =>
    externalListRequest<WildfireRisk>("산림청 산불위험예보", `/api/v1/external/wildfire/risk?pageNo=${pageNo}&numOfRows=${numOfRows}`),

  landslideForecast: (pageNo = 1, numOfRows = 100) =>
    externalListRequest<LandslideForecast>("산사태 예측정보", `/api/v1/external/landslide/forecast?pageNo=${pageNo}&numOfRows=${numOfRows}`),

  landslideHistory: (pageNo = 1, numOfRows = 100) =>
    externalListRequest<LandslideHistory>("산사태 발생이력", `/api/v1/external/landslide/history?pageNo=${pageNo}&numOfRows=${numOfRows}`),

  landslideRegionalRisk: (pageNo = 1, numOfRows = 100) =>
    externalListRequest<LandslideRegionalRisk>("산사태 지역위험", `/api/v1/external/landslide/regional-risk?pageNo=${pageNo}&numOfRows=${numOfRows}`),
};
