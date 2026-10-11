export type FieldLinkStatus = "checking" | "online" | "offline";

type FieldLinkEnvironment = {
  VITE_FIELDLINK_URL?: string;
  VITE_FIELDLINK_WEB_URL?: string;
};

type BrowserLocation = Pick<Location, "protocol" | "hostname">;

export type FieldLinkConfig = {
  apiUrl: string;
  apiConfigurationIssue: string | null;
  webUrl: string | null;
  webConfigurationIssue: string | null;
};

export type FieldLinkHealthResult = {
  status: Exclude<FieldLinkStatus, "checking">;
  reason: string;
};

function normalizeHttpUrl(
  value: string | undefined,
  pageProtocol: string,
  allowQueryAndHash = true,
): string | null {
  const candidate = value?.trim();

  if (!candidate) return null;

  try {
    const url = new URL(candidate);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    if (pageProtocol === "https:" && url.protocol !== "https:") {
      return null;
    }

    if (url.username || url.password) {
      return null;
    }

    if (!allowQueryAndHash && (url.search || url.hash)) {
      return null;
    }

    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function defaultApiUrl(location?: BrowserLocation) {
  return location &&
    (location.protocol === "http:" || location.protocol === "https:")
    ? `${location.protocol}//${location.hostname}:18080`
    : "http://127.0.0.1:18080";
}

export function resolveFieldLinkConfig(
  environment: FieldLinkEnvironment,
  location?: BrowserLocation,
): FieldLinkConfig {
  const pageProtocol = location?.protocol ?? "http:";
  const configuredApi = environment.VITE_FIELDLINK_URL?.trim();
  const configuredWeb = environment.VITE_FIELDLINK_WEB_URL?.trim();
  const apiUrl = normalizeHttpUrl(configuredApi, pageProtocol, false);
  const webUrl = normalizeHttpUrl(configuredWeb, pageProtocol);

  return {
    apiUrl: apiUrl ?? defaultApiUrl(location),
    apiConfigurationIssue:
      configuredApi && !apiUrl
        ? "VITE_FIELDLINK_URL이 유효한 HTTP(S) 주소가 아니거나 혼합 콘텐츠를 유발하여 기본 주소를 사용합니다."
        : null,
    webUrl,
    webConfigurationIssue:
      configuredWeb && !webUrl
        ? "VITE_FIELDLINK_WEB_URL이 유효한 HTTP(S) 주소가 아니거나 혼합 콘텐츠를 유발합니다."
        : !configuredWeb
          ? "메신저 웹 UI 주소(VITE_FIELDLINK_WEB_URL)가 설정되지 않았습니다."
          : null,
  };
}

export function canLaunchFieldLinkWebUi(
  status: FieldLinkStatus,
  config: FieldLinkConfig,
) {
  return status === "online" && config.webUrl !== null;
}

export function getFieldLinkConfig() {
  return resolveFieldLinkConfig(
    {
      VITE_FIELDLINK_URL:
        import.meta.env["VITE_FIELDLINK_URL"],
      VITE_FIELDLINK_WEB_URL:
        import.meta.env["VITE_FIELDLINK_WEB_URL"],
    },
    typeof window === "undefined" ? undefined : window.location,
  );
}

export async function probeFieldLinkHealth(
  baseUrl: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<FieldLinkHealthResult> {
  try {
    const response = await fetcher(
      `${baseUrl.replace(/\/+$/, "")}/health`,
      {
        method: "GET",
        cache: "no-store",
        signal,
      },
    );

    if (!response.ok) {
      return {
        status: "offline",
        reason:
          response.status > 0
            ? `FieldLink 상태 확인 실패 (HTTP ${response.status})`
            : "FieldLink 응답을 확인할 수 없습니다. CORS 정책을 확인하세요.",
      };
    }

    return {
      status: "online",
      reason: "FieldLink API 온라인",
    };
  } catch (error) {
    return {
      status: "offline",
      reason:
        error instanceof DOMException && error.name === "AbortError"
          ? "FieldLink 상태 확인 시간이 초과되었습니다."
          : "FieldLink 응답을 확인할 수 없습니다. 네트워크와 CORS 정책을 확인하세요.",
    };
  }
}
