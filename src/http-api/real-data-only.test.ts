import { afterEach, expect, it, vi } from 'vitest';
import { forestApi, loadEventOverview } from './forest-api';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('legacy demo, preview and E2E parameters still use real APIs and preserve empty data', async () => {
  vi.stubGlobal('window', { location: { pathname: '/', search: '?demo=1&preview=1&e2e=1&field=1' } });
  const eventId = 'real-empty-event';
  const assets = vi.spyOn(forestApi, 'dashboardDisasterAssets').mockResolvedValue({ data: {
    disaster: { disasterId: eventId }, assetCount: 0, assets: [],
  } });
  const telemetry = vi.spyOn(forestApi, 'dashboardDroneTelemetry').mockResolvedValue({ data: [] });
  vi.spyOn(forestApi, 'resources').mockResolvedValue({ data: [], page: { limit: 100, nextCursor: null } });
  const overview = await loadEventOverview({ eventId });
  expect(assets).toHaveBeenCalledWith(eventId);
  expect(telemetry).toHaveBeenCalledWith(eventId);
  expect(overview.assets).toEqual([]);
  expect(overview.personnel).toEqual([]);
  expect(overview.kpis).toEqual([]);
});

it('E2E parameters cannot fabricate a successful connection probe', async () => {
  vi.stubGlobal('window', { location: { search: '?e2e=1' } });
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 }));
  vi.stubGlobal('fetch', fetcher);
  await expect(forestApi.probeAssetConnection('real-device', 'RTSP')).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledOnce();
});
