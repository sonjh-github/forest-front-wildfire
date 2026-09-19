import { useEffect, useMemo, useState } from "react";

type VideoPlaybackProps = {
  streamUri?: string | null;
  enabled?: boolean;
  verificationStatus?: string | null;
  label?: string;
  className?: string;
};

type PlaybackKind = "HLS" | "NATIVE" | "RTSP" | "EMPTY";

function classifyPlayback(uri: string): PlaybackKind {
  const normalized = uri.trim().toLowerCase();

  if (!normalized) return "EMPTY";
  if (normalized.startsWith("rtsp://")) return "RTSP";
  if (normalized.includes(".m3u8")) return "HLS";
  if (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("blob:")
  ) {
    return "NATIVE";
  }

  return "EMPTY";
}

export default function VideoPlayback({
  streamUri,
  enabled = false,
  verificationStatus,
  label = "영상",
  className = "",
}: VideoPlaybackProps) {
  const uri = streamUri?.trim() ?? "";
  const kind = useMemo(() => classifyPlayback(uri), [uri]);
  const [playbackError, setPlaybackError] = useState(false);

  useEffect(() => {
    setPlaybackError(false);
  }, [uri]);

  const verified = verificationStatus === "REACHABLE";

  if (!enabled || !uri) {
    return (
      <div className={`video-playback video-playback--waiting ${className}`}>
        <strong>WAIT</strong>
        <span>{label} · 영상 소스 연결 대기</span>
      </div>
    );
  }

  if (kind === "RTSP") {
    return (
      <div className={`video-playback video-playback--rtsp ${className}`}>
        <strong>{verified ? "RTSP READY" : "RTSP"}</strong>
        <span>
          {verified
            ? `${label} · RTSP 확인 · 브라우저 변환 대기`
            : `${label} · RTSP 등록 · 연결 확인 필요`}
        </span>
      </div>
    );
  }

  if (kind === "HLS") {
    return (
      <div className={`video-playback video-playback--unsupported ${className}`}>
        <strong>HLS READY</strong>
        <span>{label} · HLS 플레이어 모듈 연결 대기</span>
      </div>
    );
  }

  if (kind === "NATIVE") {
    return (
      <div className={`video-playback video-playback--native ${className}`}>
        <video
          src={uri}
          muted
          autoPlay
          playsInline
          controls
          onCanPlay={() => setPlaybackError(false)}
          onError={() => setPlaybackError(true)}
        />
        {playbackError && (
          <div className="video-playback__error">
            <strong>PLAYBACK ERROR</strong>
            <span>{label} · 브라우저 재생 실패</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`video-playback video-playback--waiting ${className}`}>
      <strong>WAIT</strong>
      <span>{label} · 지원 가능한 재생 주소 대기</span>
    </div>
  );
}