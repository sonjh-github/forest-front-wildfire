import { useEffect, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import { distanceMeters } from "./operationalEvidence";
import "./distance-measure.css";

type Point = [number, number];
const formatDistance = (meters: number) => meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(1)} m`;

export default function DistanceMeasure({ map, active, onActiveChange, eventId }: {
  map: MapLibreMap | null; active: boolean; onActiveChange: (active: boolean) => void; eventId: string;
}) {
  const [points, setPoints] = useState<Point[]>([]);
  const segments = points.slice(1).map((point, index) => distanceMeters(points[index], point));
  const total = segments.reduce((sum, distance) => sum + distance, 0);

  useEffect(() => { setPoints([]); onActiveChange(false); }, [eventId, onActiveChange]);

  useEffect(() => {
    if (!map || !active) return;
    const doubleClickEnabled = map.doubleClickZoom.isEnabled();
    map.doubleClickZoom.disable();
    const click = (event: maplibregl.MapMouseEvent) => {
      setPoints(previous => [...previous, [event.lngLat.lng, event.lngLat.lat]]);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onActiveChange(false);
    };
    map.getCanvas().style.cursor = "crosshair";
    map.on("click", click);
    window.addEventListener("keydown", keydown);
    return () => {
      map.off("click", click);
      window.removeEventListener("keydown", keydown);
      map.getCanvas().style.cursor = "";
      if (doubleClickEnabled) map.doubleClickZoom.enable();
    };
  }, [map, active, onActiveChange]);

  useEffect(() => {
    if (!map) return;
    const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: points.length < 2 ? [] : [{
      type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: points },
    }] };
    const source = map.getSource("distance-measure") as GeoJSONSource | undefined;
    if (source) source.setData(data);
    else map.addSource("distance-measure", { type: "geojson", data });
    if (!map.getLayer("distance-measure-line")) map.addLayer({
      id: "distance-measure-line", type: "line", source: "distance-measure",
      paint: { "line-color": "#b512bc", "line-width": 4, "line-dasharray": [2, 1] },
    });
    const markers = points.map((point, index) => {
      const element = document.createElement("span");
      element.className = "distance-measure-point";
      element.textContent = String(index + 1);
      element.title = `측정 지점 ${index + 1}`;
      return new maplibregl.Marker({ element }).setLngLat(point).addTo(map);
    });
    return () => { markers.forEach(marker => marker.remove()); };
  }, [map, points]);

  useEffect(() => () => {
    if (!map || !map.getStyle()) return;
    if (map.getLayer("distance-measure-line")) map.removeLayer("distance-measure-line");
    if (map.getSource("distance-measure")) map.removeSource("distance-measure");
  }, [map]);

  return <section className="distance-measure" aria-label="지도 거리 측정">
    <button type="button" aria-pressed={active} onClick={() => onActiveChange(!active)}>
      {active ? "측정 종료" : "거리 측정"}
    </button>
    {(active || points.length > 0) && <div className="distance-measure-panel">
      <strong aria-live="polite">총거리 {formatDistance(total)}</strong>
      <small>{active ? "지도를 클릭해 지점을 추가하세요. Esc로 종료합니다." : "측정 완료 · 다시 켜면 지점을 이어서 추가합니다."}</small>
      <small>지점 간 수평 직선거리</small>
      {segments.length > 0 && <ol aria-label="구간별 측정 거리">{segments.map((distance, index) =>
        <li key={index}>{index + 1} → {index + 2}<b>{formatDistance(distance)}</b></li>,
      )}</ol>}
      <div className="distance-measure-actions">
        <button type="button" disabled={!points.length} onClick={() => setPoints(previous => previous.slice(0, -1))}>마지막 지점 취소</button>
        <button type="button" disabled={!points.length} onClick={() => setPoints([])}>초기화</button>
      </div>
    </div>}
  </section>;
}
