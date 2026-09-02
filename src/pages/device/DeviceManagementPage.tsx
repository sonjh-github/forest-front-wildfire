import { useEffect, useState } from "react";
import AssetRegistryModal from "../../features/disaster-dashboard/AssetRegistryModal";
import DeviceLogList from "./DeviceLogList";
import "./device-management-page.css";

export default function DeviceManagementPage() {
  const [registryOpen, setRegistryOpen] = useState(false);
  const [lastRegisteredAt, setLastRegisteredAt] = useState<Date | null>(null);

  useEffect(() => {
    document.body.classList.add("device-page-scroll");
    return () => document.body.classList.remove("device-page-scroll");
  }, []);

  return (
    <main className="device-management-page">
      <header className="device-management-header">
        <div>
          <small>FOREST DEVICE MANAGEMENT</small>
          <h1>장비 관리</h1>
          <p>
            Core 기준 물리 장비 등록과 장비 로그 조회를 분리된 화면에서 관리합니다.
          </p>
        </div>

        <div className="device-management-actions">

          <button
            type="button"
            className="primary"
            onClick={() => setRegistryOpen(true)}
          >
            장비 등록
          </button>
        </div>
      </header>

      <DeviceLogList lastRegisteredAt={lastRegisteredAt} />

      {registryOpen && (
        <AssetRegistryModal
          onClose={() => setRegistryOpen(false)}
          onRegistered={() => {
            setLastRegisteredAt(new Date());
          }}
        />
      )}
    </main>
  );
}
