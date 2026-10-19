import Hls from "hls.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { resolveBrowserPlaybackUri } from "./videoPlaybackUri";
import {
  playbackStateLabel,
  stateAfterFatalError,
  type VideoPlaybackState,
} from "./videoPlaybackState";

type VideoPlaybackProps = {
  streamUri?: string | null;
  enabled?: boolean;
  verificationStatus?: string | null;
  label?: string;
  className?: string;
  onPlaybackStateChange?: (state: VideoPlaybackState) => void;
};

type PlaybackKind = "HLS" | "NATIVE" | "EMPTY";

function classifyPlayback(uri: string): PlaybackKind {
  const normalized = uri.trim().toLowerCase();

  if (!normalized) return "EMPTY";
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
  onPlaybackStateChange,
}: VideoPlaybackProps) {
  const sourceUri = streamUri?.trim() ?? "";

  const playbackUri = useMemo(
    () => resolveBrowserPlaybackUri(sourceUri),
    [sourceUri],
  );

  const kind = useMemo(
    () => classifyPlayback(playbackUri),
    [playbackUri],
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const retryAttemptsRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playbackError, setPlaybackError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playbackState, setPlaybackState] =
    useState<VideoPlaybackState>("CONNECTING");

  const updatePlaybackState = (state: VideoPlaybackState) => {
    setPlaybackState(state);
    onPlaybackStateChange?.(state);
  };

  const verified = verificationStatus === "REACHABLE";

  useEffect(() => {
    retryAttemptsRef.current = 0;

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    setPlaybackError(false);
    setPlaying(false);
    updatePlaybackState("CONNECTING");
  }, [playbackUri]);

  useEffect(() => {
    const video = videoRef.current;

    if (
      !video ||
      !enabled ||
      !playbackUri ||
      kind !== "HLS"
    ) {
      return;
    }

    // Chromium may report native HLS support but fail on MPEG-TS streams.
    // Prefer hls.js/MSE; use native HLS only when MSE is unavailable.
    if (!Hls.isSupported() && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playbackUri;

      void video.play().catch(() => {
        // autoplay can be blocked by browser policy.
      });

      return () => {
        video.pause();
        video.removeAttribute("src");
        video.load();
      };
    }

    if (!Hls.isSupported()) {
      setPlaybackError(true);
      return;
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
    });

    const clearRetryTimer = () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const markLive = () => {
      clearRetryTimer();
      retryAttemptsRef.current = 0;
      setPlaybackError(false);
      updatePlaybackState("LIVE");
    };

    const scheduleRecovery = (recover: () => void) => {
      clearRetryTimer();

      const decision = stateAfterFatalError(
        retryAttemptsRef.current,
      );

      retryAttemptsRef.current = decision.nextAttempt;
      setPlaying(false);
      updatePlaybackState(decision.state);

      if (!decision.retry) {
        setPlaybackError(true);

        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          retryAttemptsRef.current = 0;
          setPlaybackError(false);
          updatePlaybackState("RECONNECTING");

          if (hls.media) {
            recover();
          }
        }, 15000);

        return;
      }

      setPlaybackError(false);

      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;

        if (hls.media) {
          recover();
        }
      }, decision.delayMs);
    };

    hls.attachMedia(video);

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      updatePlaybackState("CONNECTING");
      hls.loadSource(playbackUri);
    });

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      setPlaybackError(false);

      void video.play().catch(() => {
        // muted video is normally autoplayable; controls remain available.
      });
    });

    hls.on(Hls.Events.FRAG_BUFFERED, () => {
      if (!video.paused && video.readyState >= 2) {
        markLive();
      }
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) {
        return;
      }

      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        scheduleRecovery(() => hls.startLoad());
        return;
      }

      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        scheduleRecovery(() => hls.recoverMediaError());
        return;
      }

      clearRetryTimer();
      setPlaying(false);
      setPlaybackError(true);
      updatePlaybackState("OFFLINE");
    });

    return () => {
      clearRetryTimer();
      hls.destroy();
    };
  }, [enabled, kind, playbackUri]);

  if (!enabled || !sourceUri) {
    return (
      <div className={`video-playback video-playback--waiting ${className}`}>
        <strong>WAIT</strong>
        <span>{label} · 영상 소스 연결 대기</span>
      </div>
    );
  }

  if (!playbackUri) {
    return (
      <div className={`video-playback video-playback--waiting ${className}`}>
        <strong>WAIT</strong>
        <span>{label} · 브라우저 재생 주소 확인 필요</span>
      </div>
    );
  }

  if (kind === "HLS") {
    return (
      <div className={`video-playback video-playback--native ${className}`}>
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          controls
          onPlaying={() => {
            retryAttemptsRef.current = 0;
            setPlaying(true);
            setPlaybackError(false);
            updatePlaybackState("LIVE");
          }}
          onWaiting={() => setPlaying(false)}
          onCanPlay={() => setPlaybackError(false)}
          onError={() => {
            setPlaying(false);
            setPlaybackError(true);
            updatePlaybackState("OFFLINE");
          }}
        />

        {!playing && !playbackError && (
          <div
            className="video-playback__status"
            data-playback-state={playbackState}
          >
            <strong>{playbackStateLabel(playbackState)}</strong>
            <span>
              {label} ·{" "}
              {playbackState === "RECONNECTING"
                ? `영상 재연결 시도 ${retryAttemptsRef.current}/5`
                : verified
                  ? "HLS 스트림 연결 중"
                  : "영상 스트림 확인 중"}
            </span>
          </div>
        )}

        {playbackError && (
          <div
            className="video-playback__error"
            data-playback-state={playbackState}
          >
            <strong>{playbackStateLabel(playbackState)}</strong>
            <span>{label} · 15초 후 자동 재연결 재시도</span>
          </div>
        )}
      </div>
    );
  }

  if (kind === "NATIVE") {
    return (
      <div className={`video-playback video-playback--native ${className}`}>
        <video
          src={playbackUri}
          muted
          autoPlay
          playsInline
          controls
          onPlaying={() => setPlaying(true)}
          onWaiting={() => setPlaying(false)}
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
