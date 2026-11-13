import { useEffect, useRef } from "react";
import type { ApiRecord } from "../../http-api";
import "./radio-panel.css";

export default function RadioPanel({ assets, active }: { assets: ApiRecord[]; active: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const car = assets.find(asset => asset.assetCode === "SIM-RTK-CAR-01");
  const carName = car ? String(car.assetName || car.assetCode) : "SIM-RTK-CAR-01 · 장비 등록 확인 필요";
  const sync = () => frame.current?.contentWindow?.postMessage({ type: "forest-radio-context", carName, active }, window.location.origin);
  useEffect(sync, [carName, active]);
  return <iframe ref={frame} className="radio-panel-frame" src="/radio/" title="현장 무전 통화" allow="microphone 'self'" onLoad={sync} />;
}
