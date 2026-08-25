import { dashboardApi, httpApi } from "./client";

export interface ForestEvent {
  eventId: string;
  eventCode?: string;
  disasterType?: "WILDFIRE" | "LANDSLIDE" | "COMPLEX";
  eventName?: string;
  status?: string;
  severityCode?: string;
  locationName?: string;
  occurredAt?: string;
  updatedAt?: string;
  geometry?: { type?: string; coordinates?: unknown[] };
}

export interface DashboardDisasterAsset {
  assignment: {
    event_resource_id: string;
    event_id: string;
    asset_id: string;
    assigned_org_code?: string | null;
    mission?: string | null;
    assigned_at?: string | null;
    released_at?: string | null;
  };

  asset: {
    asset_id: string;
    asset_code?: string | null;
    asset_type?: string | null;
    asset_name?: string | null;
    owner_org_code?: string | null;
    model_name?: string | null;
    serial_number?: string | null;
    status?: string | null;
    specifications?: Record<string, unknown> | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
}

export interface DashboardDisasterAssetsResponse {
  data: {
    disaster: {
      disasterId: string;
      disasterCode?: string;
      disasterName?: string;
      disasterType?: string;
      status?: string;
    };
    assets: DashboardDisasterAsset[];
    assetCount: number;
  };
}

export interface PageResponse<T> {
  data: T[];
  page: {
    limit: number;
    nextCursor: string | null;
  };
}

export interface DataResponse<T> {
  data: T;
}

export type ApiRecord = Record<string, unknown>;

export interface DeviceCredential extends ApiRecord {
  credentialId: string;
  assetId: string;
  secret: string;
  secretShownOnce: true;
}

export interface NetworkTopology {
  networks: ApiRecord[];
  nodes: ApiRecord[];
  links: ApiRecord[];
}

export interface EventTimeline {
  from: string;
  to: string;
  stepMinutes: 1;
  assetStatuses: ApiRecord[];
  personnelPositions: ApiRecord[];
}

export type IntegrationDomain = "common" | "wildfire" | "landslide";
export type IntegrationKind = "communication" | "ai";

export interface IntegrationCapability {
  id: string;
  domain: IntegrationDomain;
  kind: IntegrationKind;
  direction: "INBOUND" | "OUTBOUND" | "BIDIRECTIONAL";
  description: string;
  inputFields: string[];
  outputFields: string[];
  configured: boolean;
  owner?: string;
  boundary?: "TOBE" | "EXTERNAL";
  evidenceStatus?: "IMPLEMENTED" | "MOCK" | "CONTRACT_ONLY";
}

const DASHBOARD_ASSET_CACHE_TTL_MS = 10_000;

type DashboardAssetCacheEntry = {
  expiresAt: number;
  request: Promise<DashboardDisasterAssetsResponse>;
};

const dashboardAssetCache = new Map<string, DashboardAssetCacheEntry>();

function loadDashboardDisasterAssetsCached(
  disasterId: string,
): Promise<DashboardDisasterAssetsResponse> {
  const now = Date.now();
  const cached = dashboardAssetCache.get(disasterId);

  if (cached && cached.expiresAt > now) {
    return cached.request;
  }

  const request = forestApi.dashboardDisasterAssets(disasterId);

  dashboardAssetCache.set(disasterId, {
    expiresAt: now + DASHBOARD_ASSET_CACHE_TTL_MS,
    request,
  });

  void request.catch(() => {
    const current = dashboardAssetCache.get(disasterId);

    if (current?.request === request) {
      dashboardAssetCache.delete(disasterId);
    }
  });

  return request;
}

export const forestApi = {
  health: () =>
    httpApi<{
      status: string;
      service: string;
      framework: string;
    }>("/health"),

  databaseHealth: () =>
    httpApi<{
      status: string;
      database: string;
    }>("/health/db"),

  events: (limit = 50) =>
    httpApi<PageResponse<ForestEvent>>(
      `/api/v1/events?limit=${limit}`,
    ),

  event: (eventId: string) =>
    httpApi<DataResponse<ForestEvent>>(
      `/api/v1/events/${encodeURIComponent(eventId)}`,
    ),

  dashboardDisasterAssets: (disasterId: string) =>
    dashboardApi<DashboardDisasterAssetsResponse>(
      `/api/v1/dashboard/disasters/${encodeURIComponent(disasterId)}/assets`,
    ),

  resources: (
    eventId: string,
    resource: string,
    limit = 200,
  ) =>
    httpApi<PageResponse<ApiRecord>>(
      `/api/v1/events/${encodeURIComponent(eventId)}/${resource}?limit=${limit}`,
    ),

  domainResources: (
    eventId: string,
    domain: "wildfire" | "landslide",
    resource: string,
    limit = 200,
  ) =>
    httpApi<PageResponse<ApiRecord>>(
      `/api/v1/events/${encodeURIComponent(eventId)}/${domain}/${resource}?limit=${limit}`,
    ),

  latestAssetStatuses: (eventId: string) =>
    httpApi<PageResponse<ApiRecord>>(
      `/api/v1/events/${encodeURIComponent(eventId)}/asset-statuses/latest?limit=200`,
    ),

  latestPersonnelPositions: (eventId: string) =>
    httpApi<PageResponse<ApiRecord>>(
      `/api/v1/events/${encodeURIComponent(eventId)}/personnel-positions/latest?limit=200`,
    ),

  networkTopology: (eventId: string) =>
    httpApi<DataResponse<NetworkTopology>>(
      `/api/v1/events/${encodeURIComponent(eventId)}/network-topology`,
    ),

  timeline: (
    eventId: string,
    from: string,
    to: string,
  ) =>
    httpApi<DataResponse<EventTimeline>>(
      `/api/v1/events/${encodeURIComponent(eventId)}/timeline?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&stepMinutes=1`,
    ),

  assets: (limit = 200) =>
    httpApi<PageResponse<ApiRecord>>(
      `/api/v1/assets?limit=${limit}`,
    ),

  registerAsset: (payload: ApiRecord) =>
    httpApi<DataResponse<ApiRecord>>(
      "/api/v1/assets",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  videoChannels: (assetId: string) =>
    httpApi<DataResponse<ApiRecord[]>>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/video-channels`,
    ),

  registerVideoChannel: (
    assetId: string,
    payload: ApiRecord,
  ) =>
    httpApi<DataResponse<ApiRecord>>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/video-channels`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  updateVideoChannel: (
    assetId: string,
    videoChannelId: string,
    payload: ApiRecord,
  ) =>
    httpApi<DataResponse<ApiRecord>>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/video-channels/${encodeURIComponent(videoChannelId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    ),

  assetNetworkSettings: (assetId: string) =>
    httpApi<DataResponse<ApiRecord>>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/network-settings`,
    ),

  updateAssetNetworkSettings: (
    assetId: string,
    payload: ApiRecord,
  ) =>
    httpApi<DataResponse<ApiRecord>>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/network-settings`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    ),

  probeAssetConnection: (
    assetId: string,
    type: "MAVLINK_UDP" | "RTSP",
  ) =>
    httpApi<DataResponse<ApiRecord>>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/connection-probes`,
      {
        method: "POST",
        body: JSON.stringify({ type }),
      },
    ),

  assignAssetToEvent: (
    eventId: string,
    payload: ApiRecord,
  ) =>
    httpApi<DataResponse<ApiRecord>>(
      `/api/v1/events/${encodeURIComponent(eventId)}/resources`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  issueDeviceCredential: (
    assetId: string,
    expiresAt?: string,
  ) =>
    httpApi<DataResponse<DeviceCredential>>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/credentials`,
      {
        method: "POST",
        body: JSON.stringify({
          credentialType: "API_KEY",
          ...(expiresAt ? { expiresAt } : {}),
        }),
      },
    ),

  integrations: () =>
    httpApi<DataResponse<IntegrationCapability[]>>(
      "/api/v1/integrations",
    ),
};

export async function loadEventTimeline(
  eventId: string,
  from: string,
  to: string,
): Promise<EventTimeline> {
  try {
    return (
      await forestApi.timeline(
        eventId,
        from,
        to,
      )
    ).data;
  } catch {
    const [
      assetStatuses,
      personnelPositions,
    ] = await Promise.all([
      forestApi.latestAssetStatuses(eventId),
      forestApi.latestPersonnelPositions(eventId),
    ]);

    return {
      from,
      to,
      stepMinutes: 1,
      assetStatuses: assetStatuses.data,
      personnelPositions:
        personnelPositions.data,
    };
  }
}

export interface EventOverview {
  event: ForestEvent;
  assets: ApiRecord[];
  unregisteredAssets: ApiRecord[];
  personnel: ApiRecord[];
  networks: ApiRecord[];
  topology: NetworkTopology;
  alerts: ApiRecord[];
  reports: ApiRecord[];
  kpis: ApiRecord[];
  integrations: IntegrationCapability[];
  domainDetail: ApiRecord | null;
  domainLayers: Record<string, ApiRecord[]>;
}

let assetCatalogRequest:
  | Promise<ApiRecord[]>
  | null = null;

export function invalidateAssetCatalog() {
  assetCatalogRequest = null;
}

function loadAssetCatalog() {
  assetCatalogRequest ??=
    forestApi
      .assets()
      .then((result) => result.data)
      .catch((error) => {
        assetCatalogRequest = null;
        throw error;
      });

  return assetCatalogRequest;
}

function latestBy(
  rows: ApiRecord[],
  key: string,
): ApiRecord[] {
  const seen = new Set<string>();

  return rows.filter((row) => {
    const value = String(
      row[key] ?? row.id ?? "",
    );

    if (!value || seen.has(value)) {
      return false;
    }

    seen.add(value);
    return true;
  });
}

export async function loadEventOverview(
  event: ForestEvent,
): Promise<EventOverview> {
  const eventId = event.eventId;

  const domain =
    event.disasterType === "LANDSLIDE"
      ? "landslide"
      : "wildfire";

  const domainResourceNames =
    domain === "landslide"
      ? [
          "slope-assessments",
          "debris-flow-predictions",
          "victim-candidates",
          "rssi-detections",
        ]
      : [
          "firelines",
          "spread-predictions",
          "communication-coverages",
        ];

  const [
    eventResult,
    assetStatuses,
    personnel,
    dashboardAssets,
    networks,
    topology,
    alerts,
    reports,
    kpis,
    integrations,
    detail,
    assetCatalog,
    analyses,
    domainLayerResults,
  ] = await Promise.all([
    forestApi.event(eventId),

    forestApi.latestAssetStatuses(
      eventId,
    ),

    forestApi.latestPersonnelPositions(
      eventId,
    ),

    loadDashboardDisasterAssetsCached(
      eventId,
    ),

    forestApi.resources(
      eventId,
      "networks",
    ),

    forestApi
      .networkTopology(eventId)
      .catch(() => ({
        data: {
          networks: [],
          nodes: [],
          links: [],
        },
      })),

    forestApi.resources(
      eventId,
      "alerts",
    ),

    forestApi.resources(
      eventId,
      "situation-reports",
    ),

    forestApi
      .resources(
        eventId,
        "kpis",
        100,
      )
      .catch(() => ({
        data: [],
        page: {
          limit: 100,
          nextCursor: null,
        },
      })),

    forestApi.integrations(),

    forestApi.domainResources(
      eventId,
      domain,
      "detail",
      1,
    ),

    loadAssetCatalog(),

    forestApi
      .resources(
        eventId,
        "analyses",
        100,
      )
      .catch(() => ({
        data: [],
        page: {
          limit: 100,
          nextCursor: null,
        },
      })),

    Promise.all(
      domainResourceNames.map(
        async (resource) => {
          try {
            return [
              resource,
              (
                await forestApi.domainResources(
                  eventId,
                  domain,
                  resource,
                  100,
                )
              ).data,
            ] as const;
          } catch {
            return [
              resource,
              [],
            ] as const;
          }
        },
      ),
    ),
  ]);

  const analysisLayerNames:
    Record<string, string> = {
      AI_RAN_COVERAGE:
        "ai-ran-coverages",
      RELAY_PLACEMENT:
        "relay-placement-candidates",
      IGNITION_DETECTION:
        "ignition-detections",
      VEHICLE_DETECTION:
        "vehicle-detections",
      ROAD_SEGMENTATION:
        "road-segmentations",
      CHANGE_DETECTION:
        "change-detections",
      VITAL_SIGNAL_DETECTION:
        "vital-signal-detections",
    };

  const analysisLayers =
    analyses.data.reduce<
      Record<string, ApiRecord[]>
    >((grouped, row) => {
      const layerName =
        analysisLayerNames[
          String(
            row.analysisType ?? "",
          )
        ];

      if (
        layerName &&
        row.resultGeometry
      ) {
        (
          grouped[layerName] ??= []
        ).push(row);
      }

      return grouped;
    }, {});

  const fetchedDomainLayers =
    Object.fromEntries(
      domainLayerResults,
    );

  const debrisRows =
    fetchedDomainLayers[
      "debris-flow-predictions"
    ] ?? [];

  const assetById = new Map(
    assetCatalog.map((asset) => [
      String(asset.assetId),
      asset,
    ]),
  );

  const latestStatusByAssetId =
    new Map(
      latestBy(
        assetStatuses.data,
        "assetId",
      ).map((status) => [
        String(status.assetId),
        status,
      ]),
    );

  const activeDashboardAssets =
    dashboardAssets.data.assets.filter(
      (row) =>
        row.assignment.released_at ===
        null,
    );

  const registeredAssetIds =
    new Set(
      activeDashboardAssets.map(
        (row) =>
          String(row.asset.asset_id),
      ),
    );

  return {
    event: eventResult.data,

    assets:
      activeDashboardAssets.map(
        ({ assignment, asset }) => {
          const assetId = String(
            asset.asset_id,
          );

          return {
            assetId: asset.asset_id,
            assetCode: asset.asset_code,
            assetType: asset.asset_type,
            assetName: asset.asset_name,
            ownerOrgCode:
              asset.owner_org_code,
            modelName: asset.model_name,
            serialNumber:
              asset.serial_number,
            status: asset.status,

            specifications:
              asset.specifications,

            createdAt:
              asset.created_at,
            updatedAt:
              asset.updated_at,

            eventResourceId:
              assignment.event_resource_id,
            eventId:
              assignment.event_id,
            assignedOrgCode:
              assignment.assigned_org_code,
            mission:
              assignment.mission,
            assignedAt:
              assignment.assigned_at,
            releasedAt:
              assignment.released_at,

            ...latestStatusByAssetId.get(
              assetId,
            ),

            eventRegistrationStatus:
              "REGISTERED",
          };
        },
      ),

    unregisteredAssets: [
      ...latestStatusByAssetId.entries(),
    ]
      .filter(
        ([assetId]) =>
          !registeredAssetIds.has(
            assetId,
          ),
      )
      .map(
        ([assetId, status]) => ({
          ...assetById.get(assetId),
          ...status,
          eventRegistrationStatus:
            "UNREGISTERED",
        }),
      ),

    personnel: latestBy(
      personnel.data,
      "personExternalId",
    ),

    networks: networks.data,

    topology: topology.data,

    alerts: alerts.data,

    reports: reports.data,

    kpis: kpis.data,

    integrations: integrations.data,

    domainDetail:
      detail.data[0] ?? null,

    domainLayers: {
      ...fetchedDomainLayers,

      ...(debrisRows.length
        ? {
            "debris-flow-paths":
              debrisRows,
            "debris-flow-areas":
              debrisRows,
          }
        : {}),

      ...analysisLayers,
    },
  };
}