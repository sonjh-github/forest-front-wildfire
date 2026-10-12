import type { ApiRecord, EventOverview, ForestEvent } from "./forest-api";

const DEFAULT_FIELD_EVENT_ID = "field-md1000-local";
export function fieldEventId(): string {
  const configured = import.meta.env.VITE_FIELD_EVENT_ID?.trim();
  return configured || DEFAULT_FIELD_EVENT_ID;
}

export function fieldAssetCode(): string {
  return import.meta.env.VITE_FIELD_ASSET_CODE?.trim() || "MD1000-01";
}

export function isLocalFieldMode(): boolean {
  if (import.meta.env.VITE_FIELD_MODE_ENABLED !== "1" || typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("field") === "1" && params.get("e2e") !== "1";
}

export function fieldEvent(): ForestEvent {
  return {
    eventId: fieldEventId(),
    eventCode: "FIELD-MD1000",
    disasterType: "WILDFIRE",
    eventName: "MD1000 현장 실기체 연동",
    status: "RESPONDING",
    severityCode: "NORMAL",
    locationName: "LOCAL FIELD SESSION",
  };
}

export function fieldCoreStatusLabel(status: unknown, matched: number): string {
  if (status === "CONNECTED") {
    return matched > 0
      ? "Core API 정상"
      : "Core API 정상 · 실기체 위치 대기";
  }
  if (status === "UNAVAILABLE") {
    return "Core API 재연결 중 · 마지막 유효 위치 유지";
  }
  return "Core API 상태 확인 중";
}

export function emptyFieldOverview(event: ForestEvent = fieldEvent()): Omit<EventOverview, "assets" | "liveDroneTelemetry"> {
  return {
    event,
    unregisteredAssets: [],
    personnel: [],
    networks: [],
    topology: { networks: [], nodes: [], links: [] },
    alerts: [],
    reports: [],
    kpis: [],
    integrations: [],
    domainDetail: null,
    domainLayers: {},
  };
}
