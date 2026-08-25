export type MapTimelineSnapshot = {
  at: string;
  locations: import("./UnifiedDisasterDashboard").LiveLocation[];
};

type Props = {
  snapshots: MapTimelineSnapshot[];
  activeIndex: number | null;
  playing: boolean;
  loading: boolean;
  onPlayToggle: () => void;
  onIndexChange: (index: number) => void;
  onLive: () => void;
};

function timeLabel(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function MapTimelinePlayer({ snapshots, activeIndex, playing, loading, onPlayToggle, onIndexChange, onLive }: Props) {
  const lastIndex = Math.max(0, snapshots.length - 1);
  const sliderIndex = activeIndex ?? lastIndex;
  const snapshot = snapshots[sliderIndex];
  const historical = activeIndex !== null;

  return (
    <section className="map-timeline-player" aria-label="지도 시간 재생">
      <button
        type="button"
        className="timeline-play"
        onClick={onPlayToggle}
        disabled={loading || snapshots.length < 2}
        aria-label={playing ? "재생 일시정지" : "시간순 재생"}
      >{playing ? "Ⅱ" : "▶"}</button>
      <div className="timeline-track">
        <header>
          <strong>{historical && snapshot ? timeLabel(snapshot.at) : "현재 실시간"}</strong>
          <span>1분 단위 스냅샷</span>
          <small>{snapshot?.locations.length ?? 0}개 위치</small>
        </header>
        <input
          type="range"
          min={0}
          max={lastIndex}
          step={1}
          value={sliderIndex}
          disabled={loading || snapshots.length < 2}
          onChange={(event) => onIndexChange(Number(event.target.value))}
          aria-label="지도 스냅샷 시간"
        />
        <footer>
          <span>{snapshots[0] ? timeLabel(snapshots[0].at) : "이력 대기"}</span>
          <span>{snapshots[lastIndex] ? timeLabel(snapshots[lastIndex].at) : "현재"}</span>
        </footer>
      </div>
      <button type="button" className={!historical ? "timeline-live active" : "timeline-live"} onClick={onLive} disabled={loading}>
        <i /> LIVE
      </button>
      <b className="timeline-speed">1분/초</b>
    </section>
  );
}
