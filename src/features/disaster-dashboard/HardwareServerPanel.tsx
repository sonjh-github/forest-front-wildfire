import { useEffect, useState } from "react";

type Telemetry = {
  assetId: string;
  observedAt: string;
  geometry?: { coordinates?: number[] };
  attributes?: {
    sourceAddress?: string;
    batteryPercent?: number;
    altitudeM?: number;
  };
};

type ServerState = {
  key: "drone" | "hardware";
  label: string;
  port: number;
  online: boolean;
  telemetry: Telemetry | null;
  error?: string;
};

const servers = [
  { key: "drone" as const, label: "드론 서버", port: 19999, baseUrl: import.meta.env.VITE_DRONE_SERVER_URL || "/drone-server" },
  { key: "hardware" as const, label: "하드웨어 서버", port: 18890, baseUrl: import.meta.env.VITE_HARDWARE_SERVER_URL || "/hardware-server" },
];

async function readServer(server: typeof servers[number]): Promise<ServerState> {
  try {
    const [healthResponse, telemetryResponse] = await Promise.all([
      fetch(`${server.baseUrl}/health`, { cache: "no-store" }),
      fetch(`${server.baseUrl}/telemetry`, { cache: "no-store" }),
    ]);
    if (!healthResponse.ok || !telemetryResponse.ok) throw new Error(`HTTP ${healthResponse.status}/${telemetryResponse.status}`);
    const health = await healthResponse.json() as { status?: string };
    const telemetry = await telemetryResponse.json() as { data?: Telemetry[] };
    return {
      key: server.key,
      label: server.label,
      port: server.port,
      online: health.status === "ok" || health.status === "degraded",
      telemetry: telemetry.data?.[0] ?? null,
    };
  } catch (error) {
    return {
      key: server.key,
      label: server.label,
      port: server.port,
      online: false,
      telemetry: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function coordinate(item: Telemetry | null, index: number) {
  const value = Number(item?.geometry?.coordinates?.[index]);
  return Number.isFinite(value) ? value.toFixed(5) : "-";
}

export function HardwareServerPanel() {
  const [states, setStates] = useState<ServerState[]>(servers.map((server) => ({
    key: server.key,
    label: server.label,
    port: server.port,
    online: false,
    telemetry: null,
  })));

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const next = await Promise.all(servers.map(readServer));
      if (active) setStates(next);
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section className="hardware-server-strip" aria-label="드론 및 하드웨어 서버 실시간 상태">
      {states.map((server) => {
        const telemetry = server.telemetry;
        const attributes = telemetry?.attributes;
        return (
          <article className="hardware-server-card" key={server.key}>
            <div className="server-card-heading">
              <strong>{server.label}</strong>
              <span className={`server-live ${server.online ? "online" : "offline"}`}>
                {server.online ? "연결" : "오프라인"}
              </span>
              <code>:{server.port}</code>
            </div>
            <div className="server-card-values">
              <span>자산 <b>{telemetry?.assetId ?? "-"}</b></span>
              <span>위도 <b>{coordinate(telemetry, 1)}</b></span>
              <span>경도 <b>{coordinate(telemetry, 0)}</b></span>
              <span>고도 <b>{Number.isFinite(Number(attributes?.altitudeM)) ? `${Number(attributes?.altitudeM).toFixed(1)}m` : "-"}</b></span>
              <span>배터리 <b>{Number.isFinite(Number(attributes?.batteryPercent)) ? `${attributes?.batteryPercent}%` : "-"}</b></span>
              <span>수신 <b>{telemetry?.observedAt ? new Date(telemetry.observedAt).toLocaleTimeString("ko-KR") : server.error ?? "-"}</b></span>
            </div>
          </article>
        );
      })}
    </section>
  );
}
