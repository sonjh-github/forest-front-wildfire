import { useState } from "react";
import AssetRegistryModal from "../../features/disaster-dashboard/AssetRegistryModal";
import DeviceLogList from "./DeviceLogList";
import "./device-management-page.css";

export default function DeviceManagementPage() {
  const [registryOpen, setRegistryOpen] = useState(false);
  const [lastRegisteredAt, setLastRegisteredAt] = useState<Date | null>(null);

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
            className="secondary"
            onClick={() => {
              window.location.href = "/";
            }}
          >
            통합상황판으로
          </button>

          <button
            type="button"
            className="primary"
            onClick={() => setRegistryOpen(true)}
          >
            장비 등록
          </button>
        </div>
      </header>

      <section className="device-management-summary">
        <article>
          <small>DEVICE REGISTRY</small>
          <strong>물리 장비 등록</strong>
          <span>
            Core asset 생성과 vendor mapping 저장을 한 번에 처리합니다.
          </span>
          <button
            type="button"
            onClick={() => setRegistryOpen(true)}
          >
            등록 화면 열기
          </button>
        </article>

        <article>
          <small>DEVICE LOG</small>
          <strong>장비 로그</strong>
          <span>
            Core 로그 API 계약 확인 후 실제 등록·조회 기능을 연결합니다.
          </span>
          <em>API 연결 대기</em>
        </article>
      </section>

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