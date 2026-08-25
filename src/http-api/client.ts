const API_HOST =
  typeof window === "undefined"
    ? "127.0.0.1"
    : window.location.hostname;

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  `http://${API_HOST}:18000`
).replace(/\/+$/, "");

const DASHBOARD_API_BASE_URL = (
  import.meta.env.VITE_DASHBOARD_API_BASE_URL?.trim() ||
  "https://api.forest.tobeunicorn.kr"
).replace(/\/+$/, "");

export class HttpApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(
      typeof payload === "object" &&
        payload &&
        "error" in payload
        ? String(
            (
              payload as {
                error?: { message?: string };
              }
            ).error?.message ?? `HTTP ${status}`,
          )
        : `HTTP ${status}`,
    );

    this.name = "HttpApiError";
  }
}

export async function httpApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  headers.set("X-Origin", "forest-front-demo");

  if (
    init.body &&
    !headers.has("Content-Type")
  ) {
    headers.set(
      "Content-Type",
      "application/json",
    );
  }

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      ...init,
      headers,
    },
  );

  const payload =
    response.status === 204
      ? null
      : await response
          .json()
          .catch(() => null);

  if (!response.ok) {
    throw new HttpApiError(
      response.status,
      payload,
    );
  }

  return payload as T;
}

export async function dashboardApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  if (
    init.body &&
    !headers.has("Content-Type")
  ) {
    headers.set(
      "Content-Type",
      "application/json",
    );
  }

  const response = await fetch(
    `${DASHBOARD_API_BASE_URL}${path}`,
    {
      ...init,
      headers,
    },
  );

  const payload =
    response.status === 204
      ? null
      : await response
          .json()
          .catch(() => null);

  if (!response.ok) {
    throw new HttpApiError(
      response.status,
      payload,
    );
  }

  return payload as T;
}