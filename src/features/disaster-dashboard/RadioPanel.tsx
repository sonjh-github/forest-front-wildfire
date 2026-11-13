import { useCallback, useEffect, useRef, useState } from "react";
import { dashboardDeviceApi, type DashboardAssetDetail } from "../../http-api/device-registration-api";
import "./radio-panel.css";

export default function RadioPanel({ active }: { active: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [assets, setAssets] = useState<DashboardAssetDetail[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const response = await dashboardDeviceApi.assets(200);
        if (alive) { setAssets(response.data); setError(""); }
      } catch { if (alive) setError("오디오 세션을 DB에서 불러오지 못했습니다."); }
      finally { loading = false; }
    };
    void load();
    const timer = active ? setInterval(() => void load(), 3000) : undefined;
    window.addEventListener("forest-audio-sessions-updated", load);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("forest-audio-sessions-updated", load); };
  }, [active]);
  const sync = useCallback(() => frame.current?.contentWindow?.postMessage({
    type: "forest-radio-context", active,
    channels: assets.filter(asset => typeof asset.audio_session === "string" && /^\d{2}$/.test(asset.audio_session)).map(asset => ({
      assetId: asset.asset_id, assetCode: asset.asset_code, label: asset.asset_name || asset.asset_code, session: asset.audio_session,
    })).sort((a, b) => a.session!.localeCompare(b.session!)),
  }, window.location.origin), [assets, active]);
  useEffect(sync, [sync]);
  return <>{error && <p role="alert">{error}</p>}<iframe ref={frame} className="radio-panel-frame" src="/radio/" title="현장 무전 통화" allow="microphone 'self'" onLoad={sync} /></>;
}
