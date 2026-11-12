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
  updateName: (assetId: string, assetName: string | null) =>
    dashboardApi<{ data: DashboardAssetDetail }>(
      `/api/v1/dashboard/assets/${encodeURIComponent(assetId)}/name`,
      { method: "PUT", body: JSON.stringify({ assetName }) },
    ),
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

export function recommendedDeviceType(vendor: DashboardVendor, assetTypeName = ""): string {
  const name = assetTypeName.trim().toUpperCase();
  if (/UAV|DRONE|드론|무인.*항공/.test(name)) return "UAV";
  if (/BACKHAUL_ROUTER|백홀.*라우터/.test(name)) return "BACKHAUL_ROUTER";
  if (/COMMUNICATION_VEHICLE|통신.*차량/.test(name)) return "COMMUNICATION_VEHICLE";
  if (vendor === "JININFRA") {
    if (/RTK_LPWA_GATEWAY|LTE_GATEWAY|게이트웨이/.test(name)) return "RTK_LPWA_GATEWAY";
    if (/RTK_BASE_STATION/.test(name)) return "RTK_BASE_STATION";
    if (/RTK_TERMINAL/.test(name)) return "RTK_TERMINAL";
    if (/NETWORK_CONTROLLER/.test(name)) return "NETWORK_CONTROLLER";
  } else {
    if (/TVWS_NMS/.test(name)) return "TVWS_NMS";
    if (/TVWS_CPE/.test(name)) return "TVWS_CPE";
    if (/TVWS_BASE/.test(name)) return "TVWS_BASE";
  }
  return "";
}
