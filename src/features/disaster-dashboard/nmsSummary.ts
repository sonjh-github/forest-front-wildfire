import type { ApiRecord } from "../../http-api";
export function receivedNumber(raw: unknown): number | null {
  if (raw == null || typeof raw === "boolean" || (typeof raw !== "number" && typeof raw !== "string") || String(raw).trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
export function nmsSummary(networks: ApiRecord[], assets: ApiRecord[]) {
  const batteries = assets.map(x => receivedNumber(x.batteryPct)).filter((x): x is number => x != null && x >= 0 && x <= 100);
  const voltages = assets.map(x => receivedNumber((x.attributes as ApiRecord | undefined)?.voltageBatteryMv)).filter((x): x is number => x != null && x > 0 && x < 65535);
  const timestamps = [...networks.map(x => x.lastReceivedAt), ...assets.map(x => x.observedAt)]
    .filter((x): x is string => typeof x === "string" && Number.isFinite(Date.parse(x))).sort((a,b) => Date.parse(b)-Date.parse(a));
  return {
    networksReceived: networks.length,
    active: networks.filter(x => x.status === "ACTIVE").length,
    degraded: networks.filter(x => x.status === "DEGRADED").length,
    failed: networks.filter(x => x.status === "FAILED").length,
    unknown: networks.filter(x => !["ACTIVE", "DEGRADED", "FAILED"].includes(String(x.status))).length,
    batteriesReceived: batteries.length,
    minVoltageV: voltages.length ? Math.min(...voltages) / 1000 : null,
    minBatteryPct: batteries.length ? Math.min(...batteries) : null,
    lowBatteryCount: batteries.length ? batteries.filter(x => x <= 20).length : null,
    lastReceivedAt: timestamps[0] ?? null,
  };
}
