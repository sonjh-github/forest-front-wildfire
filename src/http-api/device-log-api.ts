import { dashboardApi } from "./client";

export interface DashboardDeviceLog {
  request_id: string;
  vendor_code: string;
  event_external_id?: string | null;
  payload_type?: string | null;
  delivery_mode?: string | null;
  source_device_id?: string | null;
  reported_by_device_id?: string | null;
  occurred_at?: string | null;
  received_at: string;
  status?: string | null;
  payload?: Record<string, unknown> | null;
  normalized_payload?: Record<string, unknown> | null;
}

export interface DashboardDeviceLogPage {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface DashboardAssetLogsData {
  assetId: string;
  logs: DashboardDeviceLog[];
  page: DashboardDeviceLogPage;
}

export interface LoadAssetLogsOptions {
  limit?: number;
  cursor?: string | null;
}

export async function loadAssetLogs(
  assetId: string,
  options: LoadAssetLogsOptions = {},
): Promise<DashboardAssetLogsData> {
  const limit = options.limit ?? 20;

  const params = new URLSearchParams({
    limit: String(limit),
  });

  if (options.cursor) {
    params.set("cursor", options.cursor);
  }

  const response = await dashboardApi<{
    data: DashboardAssetLogsData;
  }>(
    `/api/v1/dashboard/assets/${encodeURIComponent(assetId)}/logs?${params.toString()}`,
  );

  return response.data;
}