import { dashboardApi, HttpApiError } from "./client";

export type DashboardVendor = "NDPS" | "JININFRA";
export type DashboardMappingStatus = "ACTIVE" | "PENDING" | "SUSPENDED";

export interface DashboardAssetType {
  asset_type_id: string;
  name: string;
  description?: string | null;
  enabled?: boolean;
}

export interface DashboardAssetRegistrationRequest {
  assetCode: string;
  assetTypeId: string;
  assetName?: string | null;
  status?: string;
  productName?: string | null;
  modelName?: string | null;
  specifications?: Record<string, unknown>;
  vendor: DashboardVendor;
  vendorDeviceId: string;
  deviceType: string;
  mappingStatus?: DashboardMappingStatus;
}

export interface DashboardVendorMapping {
  vendor_code?: string;
  vendor_device_id?: string;
  asset_id?: string;
  device_type?: string;
  status?: string;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface DashboardRegisteredAsset extends Record<string, unknown> {
  asset_id?: string;
  assetId?: string;
  asset_code?: string;
  asset_name?: string | null;
  status?: string;
  product_name?: string | null;
  model_name?: string | null;
  specifications?: Record<string, unknown> | null;
  vendor_mapping?: DashboardVendorMapping | null;
  vendorMapping?: DashboardVendorMapping | null;
}

export interface DashboardAssetDetail extends Record<string, unknown> {
  asset_id?: string;
  asset_code?: string;
  asset_name?: string | null;
  status?: string;
  product_name?: string | null;
  model_name?: string | null;
  specifications?: Record<string, unknown> | null;
  asset_type?: DashboardAssetType | null;
}

export interface VendorRegisterRequest {
  vendor: DashboardVendor;
  reportedByDeviceId: string;
  observedAt: string;
  devices: Array<{
    vendorDeviceId: string;
    deviceType: string;
    modelName?: string | null;
    firmwareVersion?: string | null;
    attributes?: Record<string, unknown>;
  }>;
}

export interface VendorMappingResult {
  vendorDeviceId: string;
  assetId: string | null;
  mapped: boolean;
  assetExists: boolean;
  mappingStatus:
    | "ACTIVE"
    | "PENDING"
    | "SUSPENDED"
    | "UNMAPPED"
    | "CONFLICT"
    | string;
}

export interface VendorRegisterResult {
  vendor: DashboardVendor;
  registrationStatus: "MAPPED" | "UNMAPPED" | "PARTIALLY_MAPPED" | string;
  mappedDevices: VendorMappingResult[];
  unmappedDeviceIds: string[];
  checkedAt: string;
}

const DEVICE_API_BASE_URL = (
  import.meta.env.VITE_DEVICE_API_BASE_URL?.trim() ||
  "https://device.forest.tobeunicorn.kr"
).replace(/\/+$/, "");

async function deviceApi<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(
    `${DEVICE_API_BASE_URL}${path}`,
    {
      ...init,
      headers,
    },
  );

  const payload =
    response.status === 204
      ? null
      : await response.json().catch(() => null);

  if (!response.ok) {
    throw new HttpApiError(response.status, payload);
  }

  return payload as T;
}

export function extractRegisteredAssetId(
  data: DashboardRegisteredAsset | null | undefined,
): string | null {
  if (!data) return null;

  const direct = data.asset_id ?? data.assetId;
  if (typeof direct === "string" && direct) return direct;

  const nested = data.asset;
  if (nested && typeof nested === "object") {
    const nestedAsset = nested as Record<string, unknown>;
    const nestedId = nestedAsset.asset_id ?? nestedAsset.assetId;
    if (typeof nestedId === "string" && nestedId) return nestedId;
  }

  return null;
}

export function extractVendorMapping(
  data: DashboardRegisteredAsset | null | undefined,
): DashboardVendorMapping | null {
  if (!data) return null;

  const mapping =
    data.vendor_mapping ??
    data.vendorMapping ??
    data.mapping;

  return mapping && typeof mapping === "object"
    ? mapping as DashboardVendorMapping
    : null;
}

export const dashboardDeviceApi = {
  assetTypes: () =>
    dashboardApi<{ data: DashboardAssetType[] }>(
      "/api/v1/dashboard/asset-types",
    ),

  registerAsset: (
    payload: DashboardAssetRegistrationRequest,
  ) =>
    dashboardApi<{ data: DashboardRegisteredAsset }>(
      "/api/v1/dashboard/assets",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  asset: (assetId: string) =>
    dashboardApi<{ data: DashboardAssetDetail }>(
      `/api/v1/dashboard/assets/${encodeURIComponent(assetId)}`,
    ),

  vendorRegister: (
    vendor: DashboardVendor,
    payload: VendorRegisterRequest,
  ) =>
    deviceApi<{ data: VendorRegisterResult }>(
      `/${vendor.toLowerCase()}/register`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
};
