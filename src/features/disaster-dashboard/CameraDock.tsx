import CameraPanel from "./CameraPanel";
import "./camera-dock.css";

export default function CameraDock() {
  return <section className="camera-dock" aria-label="현장 RTSP 영상 모니터">
    <CameraPanel title="TVWS 현장 영상" initialUri="rtsp://115.68.226.79:8554/tvws-c884-ch1" />
    <CameraPanel title="현장 영상 2" initialUri="rtsp://210.99.70.120:1935/live/cctv007.stream" />
  </section>;
}
