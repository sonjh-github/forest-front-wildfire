import { dashboardApi } from "./client";

export type VendorRequestLog = {
  log_id: number;
  logged_at: string;
  method: string;
  url: string;
  status_code: number;
  category: string;
  duration_ms: number;
  user_agent: string | null;
  request_body: unknown;
  response_body: unknown;
  received_at: string;
};

export async function loadVendorRequestLogs(limit = 100) {
  const response = await dashboardApi<{ data: VendorRequestLog[] }>(
    `/api/v1/dashboard/vendor-request-logs?limit=${limit}`,
  );
  return response.data;
}
