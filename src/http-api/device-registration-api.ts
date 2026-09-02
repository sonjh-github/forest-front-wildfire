import { dashboardApi } from "./client";

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
  vendor_mappings?: DashboardVendorMapping[];
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

  assets: (limit = 100) =>
    dashboardApi<{ data: DashboardAssetDetail[] }>(
      `/api/v1/dashboard/assets?limit=${limit}`,
    ),

  asset: (assetId: string) =>
    dashboardApi<{ data: DashboardAssetDetail }>(
      `/api/v1/dashboard/assets/${encodeURIComponent(assetId)}`,
    ),
};
