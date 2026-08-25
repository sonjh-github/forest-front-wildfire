import { useEffect, useState, type FormEvent } from "react";
import { forestApi, type ApiRecord } from "../../http-api";
import type { LiveLocation } from "./UnifiedDisasterDashboard";

function label(value: unknown, fallback = "-") {
  return value == null || value === "" ? fallback : String(value);
}

export default function DroneVideoModal({ drone, onClose }: { drone: LiveLocation; onClose: () => void }) {
  const [channels, setChannels] = useState<ApiRecord[]>([]);
  const [deviceIp, setDeviceIp] = useState("");
  const [mavlinkHost, setMavlinkHost] = useState("");
  const [mavlinkPort, setMavlinkPort] = useState("14550");
  const [streamUri, setStreamUri] = useState("");
  const [channelEnabled, setChannelEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [probing, setProbing] = useState<"MAVLINK_UDP" | "RTSP" | null>(null);
  const [probeResults, setProbeResults] = useState<Record<string, ApiRecord>>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([forestApi.videoChannels(drone.id), forestApi.assetNetworkSettings(drone.id)])
      .then(([channelResult, networkResult]) => {
        if (!active) return;
        const nextChannels = channelResult.data;
        const primary = nextChannels.find((channel) => channel.enabled === true) ?? nextChannels[0] ?? null;
        const forwarding = networkResult.data.mavlinkForwarding && typeof networkResult.data.mavlinkForwarding === "object"
          ? networkResult.data.mavlinkForwarding as ApiRecord : {};
        setChannels(nextChannels);
        setDeviceIp(label(networkResult.data.deviceIp, ""));
        setMavlinkHost(label(forwarding.targetHost, ""));
        setMavlinkPort(label(forwarding.targetPort, "14550"));
        setStreamUri(label(primary?.streamUri, ""));
        setChannelEnabled(primary?.enabled === true);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "드론 연결 설정을 불러오지 못했습니다.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [drone.id]);

  const primary = channels.find((channel) => channel.enabled === true) ?? channels[0] ?? null;
  const verification = label(primary?.verificationStatus, "UNVERIFIED");
  const verificationLabel = verification === "REACHABLE" ? "연결 확인"
    : verification === "UNREACHABLE" ? "연결 불가" : "연결 확인 전";

  const persistSettings = async () => {
    await forestApi.updateAssetNetworkSettings(drone.id, {
        deviceIp: deviceIp.trim(),
        mavlinkForwarding: { protocol: "UDP", targetHost: mavlinkHost.trim(), targetPort: Number(mavlinkPort) },
    });
    let savedChannel: ApiRecord | null = null;
    if (streamUri.trim()) {
      savedChannel = primary
        ? (await forestApi.updateVideoChannel(drone.id, String(primary.videoChannelId), {
            streamUri: streamUri.trim(), enabled: channelEnabled, channelName: label(primary.channelName, "주 영상"),
          })).data
        : (await forestApi.registerVideoChannel(drone.id, {
            channelCode: "MAIN", channelName: "주 영상", streamUri: streamUri.trim(), enabled: channelEnabled,
          })).data;
    }
    if (savedChannel) setChannels([savedChannel, ...channels.filter((channel) => channel.videoChannelId !== savedChannel?.videoChannelId)]);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await persistSettings();
      setMessage("드론 연결 설정을 저장했습니다.");
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "드론 연결 설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const runProbe = async (type: "MAVLINK_UDP" | "RTSP") => {
    setProbing(type);
    setError(null);
    setMessage(null);
    try {
      await persistSettings();
      const result = await forestApi.probeAssetConnection(drone.id, type);
      setProbeResults((current) => ({ ...current, [type]: result.data }));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "연결 확인에 실패했습니다.");
    } finally {
      setProbing(null);
    }
  };

  return <div className="drone-video-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="drone-video-modal" role="dialog" aria-modal="true" aria-labelledby="drone-video-title" onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <div><small>DRONE CONNECTION</small><h2 id="drone-video-title">{drone.label}</h2><span>장비·MAVLink·영상 채널 설정</span></div>
        <button type="button" onClick={onClose} aria-label="드론 연결 설정 닫기">×</button>
      </header>
      <div className="drone-video-view" data-state={loading ? "loading" : primary ? verification.toLowerCase() : "empty"}>
        {loading && <><i className="drone-video-spinner" /><strong>연결 설정 확인 중</strong></>}
        {!loading && !primary && <><i className="drone-video-empty">◉</i><strong>영상 채널 사용 대기</strong><span>아래에서 RTSP 주소를 등록하면 영상 채널 정보가 생성됩니다.</span></>}
        {!loading && primary && <><i className="drone-video-camera">●</i><strong>{channelEnabled ? "영상 채널 사용" : "영상 채널 대기"}</strong><span>{verificationLabel} · RTSP는 스트리밍 변환 모듈 연결 후 이 영역에서 재생됩니다.</span></>}
      </div>
      {!loading && <form className="drone-connection-form" onSubmit={save}>
        <fieldset><legend>장비 네트워크</legend><div>
          <label><span>GCS IP</span><input value={deviceIp} onChange={(event) => setDeviceIp(event.target.value)} placeholder="172.30.1.20" required /></label>
          <label><span>MAVLink 대상 IP</span><input value={mavlinkHost} onChange={(event) => setMavlinkHost(event.target.value)} placeholder="192.168.110.251" required /></label>
          <label><span>UDP 포트</span><input type="number" min="1" max="65535" value={mavlinkPort} onChange={(event) => setMavlinkPort(event.target.value)} required /></label>
        </div></fieldset>
        <fieldset><legend>영상 채널</legend><div>
          <label className="wide"><span>RTSP 주소</span><input value={streamUri} onChange={(event) => setStreamUri(event.target.value)} placeholder="rtsp://장비주소:포트/경로" /></label>
          <label className="drone-channel-toggle"><input type="checkbox" checked={channelEnabled} onChange={(event) => setChannelEnabled(event.target.checked)} /><span>영상 채널 사용</span></label>
        </div></fieldset>
        {error && <p className="drone-connection-message" data-kind="error">{error}</p>}
        {message && <p className="drone-connection-message" data-kind="success">{message}</p>}
        <section className="drone-probe-actions" aria-label="연결 확인">
          <div>
            <button type="button" onClick={() => void runProbe("MAVLINK_UDP")} disabled={probing !== null || saving}>{probing === "MAVLINK_UDP" ? "수신 대기 중…" : "MAVLink 수신 확인"}</button>
            {probeResults.MAVLINK_UDP && <p data-success={probeResults.MAVLINK_UDP.success === true}><strong>{probeResults.MAVLINK_UDP.success === true ? "수신 성공" : "수신 실패"}</strong><span>{label(probeResults.MAVLINK_UDP.detail)} · {label(probeResults.MAVLINK_UDP.elapsedMs)}ms</span></p>}
          </div>
          <div>
            <button type="button" onClick={() => void runProbe("RTSP")} disabled={probing !== null || saving || !streamUri.trim()}>{probing === "RTSP" ? "응답 대기 중…" : "RTSP 응답 수신 확인"}</button>
            {probeResults.RTSP && <p data-success={probeResults.RTSP.success === true}><strong>{probeResults.RTSP.success === true ? "응답 확인" : "연결 실패"}</strong><span>{label(probeResults.RTSP.detail)} · {label(probeResults.RTSP.elapsedMs)}ms</span></p>}
          </div>
        </section>
        <footer><span>상태: {verificationLabel}</span><button type="submit" disabled={saving}>{saving ? "저장 중…" : "연결 설정 저장"}</button></footer>
      </form>}
    </section>
  </div>;
}
