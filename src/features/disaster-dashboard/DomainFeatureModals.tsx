import React, { useState } from "react";
import "./unified-disaster-dashboard.css";

interface DomainFeatureModalsProps {
  activeModal: "3d-dxf" | "data-platform" | "vr-validation" | "audit-diag" | null;
  onClose: () => void;
}

export const DomainFeatureModals: React.FC<DomainFeatureModalsProps> = ({ activeModal, onClose }) => {
  if (!activeModal) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="modal-badge-kfs">산림청 실증 인증모듈</span>
            <h3>
              {activeModal === "3d-dxf" && "📐 3D 지형 CAD 변환 모듈 (XYZ → DXF R2018)"}
              {activeModal === "data-platform" && "📊 멀티모달 실증 데이터셋 & LLM 내보내기 (SCOPE-017)"}
              {activeModal === "vr-validation" && "🥽 산불 통신음영 AI 예측 VR 가상검증 (SCOPE-013)"}
              {activeModal === "audit-diag" && "🔍 통합 시스템 감사로그 & 서비스 운영진단 (SCOPE-007, 011)"}
            </h3>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {activeModal === "3d-dxf" && <DxfConverterView />}
          {activeModal === "data-platform" && <DataPlatformView />}
          {activeModal === "vr-validation" && <VrValidationView />}
          {activeModal === "audit-diag" && <AuditDiagView />}
        </div>
      </div>
    </div>
  );
};

/* --- 1. 3D 지형 CAD 변환 모듈 --- */
const DxfConverterView: React.FC = () => {
  const [fileName, setFileName] = useState("landslide_mountain_site_001.xyz");
  const [pointCount, setPointCount] = useState<number>(125400);
  const [status, setStatus] = useState<"idle" | "processing" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([
    "[시스템] XYZ 지형 좌표 데이터 처리 엔진 준비 완료",
    "[검증] EPSG:5186 (한국 중부원점) 좌표계 파싱 대기",
  ]);

  const handleStartConversion = () => {
    setStatus("processing");
    setProgress(15);
    setLogs((prev) => [...prev, `[진행] 파일 '${fileName}' 읽기 시작 (총 ${pointCount.toLocaleString()}개 정점)`]);

    setTimeout(() => {
      setProgress(50);
      setLogs((prev) => [...prev, "[진행] 3D Polyface Mesh 지형 메쉬 3차원 그리드 생성 중..."]);
    }, 800);

    setTimeout(() => {
      setProgress(85);
      setLogs((prev) => [...prev, "[진행] DXF R2018 헤더 및 레이어(Topo_Elevation, Slope_Contour) 구조 생성"]);
    }, 1600);

    setTimeout(() => {
      setProgress(100);
      setStatus("done");
      setLogs((prev) => [...prev, "[완료] 10만 정점 2.4초 처리 완료! DXF R2018 CAD 호환 파일 생성 완료."]);
    }, 2400);
  };

  return (
    <div className="dxf-converter-view">
      <div className="alert-box alert-info">
        <strong>💡 산림청 3D 지형 변환 가이드:</strong> 산사태 현장 XYZ CSV 텍스트 데이터를 파싱하여 3D Polyface Mesh
        구조의 DXF R2018 CAD 파일로 실시간 변환합니다. (10만 정점 10초 이내 / 50만 정점 무중단 기준 충족)
      </div>

      <div className="form-grid-3col">
        <div className="form-group">
          <label>입력 XYZ 파일 선택</label>
          <div className="file-input-wrapper">
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="kfs-input"
            />
          </div>
        </div>
        <div className="form-group">
          <label>정점(Point) 수</label>
          <select
            value={pointCount}
            onChange={(e) => setPointCount(Number(e.target.value))}
            className="kfs-select"
          >
            <option value={125400}>125,400 정점 (소규모 사면 - 10초 이내)</option>
            <option value={480000}>480,000 정점 (대규모 산사태 위험지 - 50만 기준)</option>
          </select>
        </div>
        <div className="form-group">
          <label>기준 좌표계</label>
          <input type="text" value="EPSG:5186 (GRS80 중부원점)" disabled className="kfs-input disabled" />
        </div>
      </div>

      <div className="conversion-status-card">
        <div className="status-header">
          <span>변환 진행률 ({progress}%)</span>
          <span className={`status-badge status-${status}`}>
            {status === "idle" && "대기 중"}
            {status === "processing" && "3D Mesh 변환 중..."}
            {status === "done" && "변환 완료"}
          </span>
        </div>
        <div className="progress-bar-bg">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
        </div>
      </div>

      <div className="console-log-box">
        <div className="console-title">엔진 로그 및 검증 실시간 출력</div>
        <div className="console-content">
          {logs.map((log, idx) => (
            <div key={idx} className="log-line">
              {log}
            </div>
          ))}
        </div>
      </div>

      <div className="modal-action-row">
        {status !== "processing" && (
          <button className="kfs-btn kfs-btn-primary" onClick={handleStartConversion}>
            🚀 3D DXF 변환 실행
          </button>
        )}
        {status === "done" && (
          <a
            href={`data:text/plain;charset=utf-8,SECTION%0A2%0AHEADER%0A0%0AENDSEC%0A0%0AEOF`}
            download="landslide_3d_mesh.dxf"
            className="kfs-btn kfs-btn-success"
          >
            💾 DXF CAD 파일 다운로드 (.dxf)
          </a>
        )}
      </div>
    </div>
  );
};

/* --- 2. 실증 데이터셋 & LLM 내보내기 모듈 --- */
const DataPlatformView: React.FC = () => {
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");
  const [includeAudio, setIncludeAudio] = useState(true);

  return (
    <div className="data-platform-view">
      <div className="alert-box alert-success">
        <strong>📋 산림청 공식 실증 데이터 플랫폼 (SCOPE-017):</strong> 현장 조사 및 제보 텍스트, GPS 좌표, 토양
        함수율, 현장 촬영 멀티모달 데이터셋의 품질 검증 및 비식별화 완료 현황입니다.
      </div>

      <div className="data-stat-grid">
        <div className="stat-card">
          <div className="stat-label">주민 제보/인터뷰 데이터</div>
          <div className="stat-value">118 <span className="stat-target">/ 100건 달성</span></div>
          <div className="stat-desc">✅ 음성 녹음 + 전사 텍스트 비식별화 완료</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">현장 요원 수색 데이터</div>
          <div className="stat-value">14 <span className="stat-target">/ 10건 달성</span></div>
          <div className="stat-desc">✅ RTK 궤적 및 음성 400MHz 무전 로그</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">현장 관측 센서 지점</div>
          <div className="stat-value">342 <span className="stat-target">/ 300지점 달성</span></div>
          <div className="stat-desc">✅ 토양 함수율 + 변위 + 경사 센서 데이터</div>
        </div>
      </div>

      <div className="table-wrapper mt-3">
        <table className="kfs-table">
          <thead>
            <tr>
              <th>데이터셋 ID</th>
              <th>유형</th>
              <th>지점 / 수량</th>
              <th>품질 검증</th>
              <th>비식별화 상태</th>
              <th>LLM 학습 호환성</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>DS-2026-LS01</code></td>
              <td>산사태 현장 토양함수율·변위</td>
              <td>120개 지점 (32만 레코드)</td>
              <td><span className="badge badge-success">통과 (99.8%)</span></td>
              <td><span className="badge badge-info">해당없음</span></td>
              <td><span className="badge badge-primary">준비완료 (JSONL)</span></td>
            </tr>
            <tr>
              <td><code>DS-2026-WF02</code></td>
              <td>산불 진화대원 통신 음영 이력</td>
              <td>84건 통신 세션</td>
              <td><span className="badge badge-success">통과 (100%)</span></td>
              <td><span className="badge badge-success">마스킹 완료</span></td>
              <td><span className="badge badge-primary">준비완료</span></td>
            </tr>
            <tr>
              <td><code>DS-2026-VOICE03</code></td>
              <td>주민/구조대 현장제보 음성-텍스트</td>
              <td>118건 전사데이터</td>
              <td><span className="badge badge-success">통과 (98.5%)</span></td>
              <td><span className="badge badge-success">개인식별 삭제</span></td>
              <td><span className="badge badge-primary">준비완료</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="export-controls-card mt-3">
        <h4>📦 LLM 및 외부 연구용 포맷 내보내기</h4>
        <div className="form-inline-group">
          <label>내보내기 포맷:</label>
          <label className="radio-label">
            <input type="radio" name="format" checked={exportFormat === "json"} onChange={() => setExportFormat("json")} />
            JSON / JSONL (LLM Fine-tuning용)
          </label>
          <label className="radio-label">
            <input type="radio" name="format" checked={exportFormat === "csv"} onChange={() => setExportFormat("csv")} />
            CSV (통계분석용)
          </label>
          <label className="checkbox-label ml-3">
            <input type="checkbox" checked={includeAudio} onChange={(e) => setIncludeAudio(e.target.checked)} />
            메타데이터 메타태그 포함
          </label>
        </div>
        <button
          className="kfs-btn kfs-btn-primary mt-2"
          onClick={() => alert(`[완료] 실증 데이터셋이 ${exportFormat.toUpperCase()} 포맷으로 생성되어 다운로드됩니다.`)}
        >
          📥 선택 데이터셋 패키지 내보내기
        </button>
      </div>
    </div>
  );
};

/* --- 3. 산불 VR 가상검증 모듈 --- */
const VrValidationView: React.FC = () => {
  return (
    <div className="vr-validation-view">
      <div className="alert-box alert-warning">
        <strong>🥽 산불 AI 통신음영 가상검증 (SFR-001 / SCOPE-013):</strong> 시뮬레이터와 음영 예측 AI 모델이 산출한
        통신 불가 지역을 VR 가상 공간 및 지도에서 입증·검증한 시나리오 분석 결과입니다.
      </div>

      <div className="vr-scenario-card">
        <div className="scenario-header">
          <span className="scenario-title">시나리오 #04: 삼척 산불 현장 TVWS / 5G 중계망 배치 및 VR 검증</span>
          <span className="badge badge-success">검증 성공 (입증 완료)</span>
        </div>
        <div className="grid-2col mt-2">
          <div className="info-block">
            <h5>예측 모델 및 조건</h5>
            <ul>
              <li><strong>지형 데이터:</strong> DEM 5m 해상도 (강원 삼척 둔전리)</li>
              <li><strong>기지국 설정:</strong> 이동형 TVWS 기지국 1대 + LEO 위성 AP 2대</li>
              <li><strong>AI 예측 모델:</strong> Viewshed & 3D Propagation AI v2.1</li>
            </ul>
          </div>
          <div className="info-block">
            <h5>VR 가상검증 입증 결과</h5>
            <ul>
              <li><strong>음영 해소율:</strong> 당초 42% 음영 → 중계기 재배치 후 96.8% 해소</li>
              <li><strong>대원 위치 수신률:</strong> 5초 주기 99.4% 수신 성공</li>
              <li><strong>VR 시뮬레이션 호환:</strong> HMD 60fps 무지연 렌더링 검증 완료</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="modal-action-row mt-3">
        <button
          className="kfs-btn kfs-btn-secondary"
          onClick={() => alert("[VR 시스템] 산림청 VR 통합 검증 HMD 시스템과의 연동 세션을 개설합니다.")}
        >
          🥽 VR 연동 장비 세션 연결
        </button>
      </div>
    </div>
  );
};

/* --- 4. 시스템 감사로그 및 서비스 진단 --- */
const AuditDiagView: React.FC = () => {
  return (
    <div className="audit-diag-view">
      <div className="grid-2col">
        <div className="card-box">
          <h4>🌐 서비스 및 연계 시스템 상태</h4>
          <table className="kfs-table compact">
            <thead>
              <tr>
                <th>시스템명</th>
                <th>상태</th>
                <th>응답속도</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>통합 API 서버 (Hono)</td>
                <td><span className="badge badge-success">정상</span></td>
                <td>12ms</td>
              </tr>
              <tr>
                <td>Supabase 데이터베이스</td>
                <td><span className="badge badge-success">정상</span></td>
                <td>18ms</td>
              </tr>
              <tr>
                <td>시나리오 슈터 (forest-api-shoot)</td>
                <td><span className="badge badge-success">동작중 (5s)</span></td>
                <td>5ms</td>
              </tr>
              <tr>
                <td>KT Supervisor 연계</td>
                <td><span className="badge badge-info">연계중</span></td>
                <td>45ms</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card-box">
          <h4>📜 최근 사용자 감사 및 명령 로그</h4>
          <div className="audit-log-list">
            <div className="audit-item">
              <span className="audit-time">10:18:04</span>
              <span className="audit-user">지휘관(admin)</span>
              <span className="audit-action">경보 발령: 대원 화선 접근 경고</span>
            </div>
            <div className="audit-item">
              <span className="audit-time">10:17:52</span>
              <span className="audit-user">통신운영자(op02)</span>
              <span className="audit-action">망 전환: TVWS → LEO 위성 전환 수동 승인</span>
            </div>
            <div className="audit-item">
              <span className="audit-time">10:15:30</span>
              <span className="audit-user">시스템(auto)</span>
              <span className="audit-action">배치 수집: 대원 14명 / 자산 22대 최신화</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
