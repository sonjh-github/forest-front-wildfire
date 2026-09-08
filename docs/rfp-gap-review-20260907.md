# 공식 RFP 추적성 검토 (2026-09-07)

기준 main: d6d90cd. Frontend 저장소에서 확인 가능한 증거 범위이며 타 기관/HW의 개발 완료 여부를 판정하지 않는다.

## 문서 기준

- 공식 RFP: 첨부 PDF 2쪽, 인쇄면 11–12쪽. 주요 연구내용 및 KPI 표를 원문·페이지 이미지로 확인.
- 연구개발계획서: PDF 82쪽, 3. 평가기준 및 평가방법. 강화 목표와 측정방법 표를 페이지 이미지로 확인.
- 기술기준서 v0.1: §2.3–2.4 기준 분리, §3.3 P0–P4, §5.4 QoS, §5.9 AI-RAN, §5.11 통합 UI. 초안 권고를 공식 RFP 요구로 승격하지 않음.
- schema_requirements_traceability.md: 설계 테이블 목록이며 실제 API 존재의 증거가 아님.
- 기존 readiness JSON: 내부 47개 전체 완료·40개 계약 PASS 주장 재검토. ZIP은 백업 참고이며 최신 main에 덮어쓰지 않음.

## 판정 기준

IMPLEMENTED: 해당 내부 요구의 Frontend 경로 구현. PARTIAL: 일부 동작은 있으나 요구 범위의 운영 연결·종단 기능이 미완. CONTRACT_ONLY: 데이터 형식/표시 계약만 있고 제어 동작 없음. NOT_IMPLEMENTED: 이 저장소/제공 증빙에서 해당 구현을 확인하지 못함.
검증 분류는 구현 상태와 독립적이며 기존 운영/DEMO/기관/현장 분류를 보존했다. DEMO 계약 검사만으로 운영 인증을 새로 부여하지 않는다.

## 요약

내부: {"total":47,"softwareComplete":24,"implemented":24,"partial":23,"contractOnly":0,"notImplemented":0,"operating":3,"demoVerified":37,"externalPending":6,"fieldPending":1}

공식 RFP: {"total":23,"implemented":0,"partial":11,"contractOnly":2,"notImplemented":10,"externalDependency":22,"fieldDependency":14}

## 공식 RFP Gap Matrix

|공식 요구|현재 상태|Frontend 근거|남은 의존사항|
|---|---|---|---|
|RFP 인쇄 p.11 / 이동형 양방향 통신 인프라 · 이음5G/LEO 비교|PARTIAL|UnifiedDisasterDashboard.tsx communicationProfile: 장비·망 역할 표시|실제 접속망/위성 링크 구축·비교 시험 증거 필요|
|RFP 인쇄 p.11 / AI-RAN 셀 커버리지 자동 조정|CONTRACT_ONLY|forest-api.ts AI_RAN_COVERAGE 매핑 / LivePositionMap.tsx 입력면 표시|자동 셀 제어·효과 검증 없음|
|RFP 인쇄 p.11 / TVWS 저주파 기지국·무선백홀|PARTIAL|UnifiedDisasterDashboard.tsx TVWS 장비·연결 정보|무선백홀 운용·장거리 성능 시험 필요|
|RFP 인쇄 p.11 / 휴대용 양방향 통신 · 상황실↔대원↔대원|NOT_IMPLEMENTED|통신장비 분류는 존재하나 음성/PTT 세션 구현 없음|휴대 단말·PTT/400MHz 음성 Gateway 및 실통화 시험|
|RFP 인쇄 p.11 / 차량탑재 소형 기지국·통신 모듈|PARTIAL|UnifiedDisasterDashboard.tsx 지휘차량·게이트웨이 상태 표시|차량 설치·전원·RF 통합 제작 및 시험은 Frontend 밖|
|RFP 인쇄 p.11 / 네트워크 이중화·자동 전환|PARTIAL|OperationsPanel.tsx primary/activePath/switchReason 조회|경로 관측 UI만 제공; 자동절체·본딩 제어 및 세션 연속성 시험 필요|
|RFP 인쇄 p.11 / NMS/BMS 관제 시스템|PARTIAL|OperationsPanel.tsx NMS/BMS 조회 요약 및 nmsSummary.ts|배터리 잔량·MAVLink 전압 수신값 집계; 전원·온도 표준 계약/제어 및 현장 연계 대기|
|RFP 인쇄 p.11 / 산악기상관측 시설 탑재 통신 모듈|NOT_IMPLEMENTED|해당 시설 전용 제어·설치 증거 없음|시설 인터페이스·장비 설치·기관 협의 필요|
|RFP 인쇄 p.11 / 단절지역 현장 자율 커버리지 생성|CONTRACT_ONLY|forest-api.ts relay-placement-candidates / 통신 커버리지 결과 레이어|결과 표시 계약만 존재; 배치 명령·자율망 제어 없음|
|RFP 인쇄 p.11 / 진화대원·차량 좌표·이동경로·실시간 상황 갱신|PARTIAL|LivePositionMap.tsx / telemetryStream.ts / MapTimelinePlayer.tsx|위치 스냅샷 재생은 사건 전체 복기 아님; 종단 갱신주기 현장 검증 필요|
|RFP 인쇄 p.11 / 위험경보·안전지대 경로·화선접근 양방향 공유|PARTIAL|OperationsPanel.tsx 경보 / LivePositionMap.tsx 경로 / telemetryStream.ts 위험면 진입 판정|위험면 접근 판정은 구현; 관측 화선 접근·단말 전달/ACK·안전경로 승인 API 미연결|
|RFP 인쇄 p.11 / 지도 위치정보 + 영상 + 상황보고 통합 현장 UI|PARTIAL|OperationsPanel.tsx 현장 통합정보: 사건·경보·자원·화선·대피·보고 조회 / 기존 DroneVideoModal 연결|영상은 설정·Probe UI이며 브라우저 재생 엔진 없음; 보고 송신 API 미확인|
|RFP 인쇄 p.11 / 산불상황관제시스템 연계|NOT_IMPLEMENTED|FIRMS·위험예보 API는 외부 데이터 조회이며 관제시스템 연계가 아님|기관 ICD·인증·연계 endpoint 및 합동 시험 필요|
|RFP 인쇄 p.11 / AI-RAN 통신자원 자동 할당·스케줄링|NOT_IMPLEMENTED|src 검색: 실제 scheduler/제어 endpoint 없음|AI-RAN 제어 서비스·기지국 인터페이스 필요|
|RFP 인쇄 p.11 / 영상·위치 대용량 트래픽 경량 전송 알고리즘|NOT_IMPLEMENTED|src 검색: 전송 최적화 알고리즘 없음|코덱/압축·프로토콜 구현 및 품질 비교 시험 필요|
|RFP 인쇄 p.11 / 비상 시 중요도 기반 데이터 전송 우선순위|NOT_IMPLEMENTED|경보 UI 정렬만 존재; 기술기준서 §3.3 P0~P4 데이터 클래스 미적용|실제 QoS 제어 Backend/HW 의존; 경보 정렬은 전송 우선순위가 아님|
|RFP 인쇄 p.12 / 연구결과 종합 평가·정책·기술 표준화 방안|PARTIAL|공식 Gap Matrix·기술기준서 초안·증빙 JSON|최종 연구보고·표준 합의 및 성과 평가 필요|
|RFP 인쇄 p.12 / 실시간 다부처 진화자원 배치현황 연계방안|NOT_IMPLEMENTED|공통 자산 화면은 존재; 다부처 인증·자원배치 연계 증거 없음|기관별 ICD·권한·자원 상태 계약과 연계방안 확정|
|RFP 인쇄 p.12 / 정부·지자체·국민 활용방안|NOT_IMPLEMENTED|내부 관제 화면만 존재; 대외 활용방안 증빙 없음|공개 범위·운영 정책·기관 합의 필요|
|RFP 인쇄 p.12 / RFP5 정보연계·RFP7 통신연계|NOT_IMPLEMENTED|schema 추적 문서는 decision_recommendation/field_task 설계만 명시|상대 시스템 ICD·명령/응답·합동 연계시험 필요|
|RFP 인쇄 p.12 / 연구 협의체 참여·성과물 및 등록 3건|NOT_IMPLEMENTED|Frontend 저장소에서 협의체·특허/등록 증빙 확인 불가|프로젝트 관리 산출물 별도 확인; 기관 전체 미수행 판정 아님|
|RFP 인쇄 p.12 / 이동형 현장통신망·차량 모듈·정보공유 시스템 각 1식|PARTIAL|GIS 관제 Frontend 및 API 클라이언트|HW 프로토타입·종단 시스템 납품/검증 증적 필요|
|RFP 인쇄 p.12 / 공식 KPI 10분·5초·98%·98%|PARTIAL|operationalEvidence.ts 표본 계산 / OperationsPanel.tsx API 측정값 조회|송신 분모·ACK·운영/중단시간·실증 시험 ID 필요; DEMO는 공인 성능시험 아님|

## 내부 47개 재판정

|ID|구현 상태|검증 분류|코드 근거 및 한계|
|---|---|---|---|
|GIS-01|IMPLEMENTED|DEMO_VERIFIED|LivePositionMap.tsx: GeoJSON 위험면 렌더링; 기관 원본 경계·예측 정확도는 별도 검증|
|GIS-02|IMPLEMENTED|DEMO_VERIFIED|UnifiedDisasterDashboard.tsx overviewLocations / LivePositionMap.tsx: 자산·인원 위치 표시|
|GIS-03|IMPLEMENTED|OPERATING|OperationsPanel.tsx onLayerToggle / LivePositionMap.tsx visibility: 독립 레이어 토글|
|GIS-04|PARTIAL|DEMO_VERIFIED|LivePositionMap.tsx 대응 레이어 렌더링; forest-api.ts에 위험구역·대피·진화자원 전용 운영 조회 연결 없음|
|FIRE-01|IMPLEMENTED|EXTERNAL_PENDING|external-disaster-api.ts 및 테스트: FIRMS 조회·오류 처리; LivePositionMap.tsx 화점 팝업. 실제 기관 응답 검증 대기|
|FIRE-02|IMPLEMENTED|EXTERNAL_PENDING|external-disaster-api.ts 및 테스트: 위험예보 조회·공간화. 기관 데이터 승인·운영 검증 대기|
|FIRE-03|IMPLEMENTED|DEMO_VERIFIED|LivePositionMap.tsx 발생지점·위험면·산불 DEMO 위험도 표시; 실제 IR 측정 아님|
|FIRE-04|IMPLEMENTED|DEMO_VERIFIED|UnifiedDisasterDashboard.tsx refreshExternalIntegrations: 외부 데이터 지도 표시; 다부처 관제연계와 별개|
|LAND-01|IMPLEMENTED|EXTERNAL_PENDING|external-disaster-api.ts: 산사태 예측정보 클라이언트·공간화 및 계약 테스트; 기관 검증 대기|
|LAND-02|IMPLEMENTED|EXTERNAL_PENDING|external-disaster-api.ts: 지역위험정보 클라이언트·위험면; 기관 검증 대기|
|LAND-03|IMPLEMENTED|EXTERNAL_PENDING|external-disaster-api.ts: 발생이력 조회·좌표 변환; 기관 검증 대기|
|LAND-04|IMPLEMENTED|OPERATING|OperationsPanel.tsx externalMapLayers: 예측·지역위험·이력 독립 토글|
|ASSET-01|IMPLEMENTED|DEMO_VERIFIED|UnifiedDisasterDashboard.tsx overviewLocations / LivePositionMap.tsx: 유형별 마커·상세|
|ASSET-02|PARTIAL|DEMO_VERIFIED|telemetryStream.ts 및 테스트: GNSS/RTK 변환값 수신; 실제 측위·RTCM 전 구간 검증 대기|
|ASSET-03|IMPLEMENTED|DEMO_VERIFIED|UnifiedDisasterDashboard.tsx 자산 상세 / OperationsPanel.tsx: 수신 상태·배터리·신호 표시|
|ASSET-04|IMPLEMENTED|DEMO_VERIFIED|pages/device/DeviceLogList.tsx / device-log-api.test.ts: assetId 로그 조회·페이지네이션|
|ASSET-05|PARTIAL|DEMO_VERIFIED|telemetryStream.ts: 브라우저 수신·재연결; Gateway→Core 실제 전달은 외부 구현·현장 증적 필요|
|DRONE-01|IMPLEMENTED|DEMO_VERIFIED|LivePositionMap.tsx: 드론 좌표 갱신; demoOverview.test.ts 이동 모사 검증|
|DRONE-02|IMPLEMENTED|DEMO_VERIFIED|UnifiedDisasterDashboard.tsx: 수신 비행상태 표시; 실기체 상태 검증 대기|
|DRONE-03|PARTIAL|DEMO_VERIFIED|telemetryStream.ts MavlinkTelemetryAccumulator: JSON MAVLink 프레임 병합 및 테스트; 바이너리 수신·실기체 검증은 별도|
|DRONE-04|PARTIAL|DEMO_VERIFIED|telemetryStream.ts: 측위방법·정확도 수신 계약; 실제 GNSS 수신·성능 검증 별도|
|DRONE-05|IMPLEMENTED|DEMO_VERIFIED|demoOverview.ts RTL·저전압 모사 / UnifiedDisasterDashboard.tsx 상태 표시; 실제 임무 제어 아님|
|DRONE-06|PARTIAL|FIELD_PENDING|LivePositionMap.tsx 위치 표시 구현; 실비행 이동 증빙 미제공|
|ALERT-01|IMPLEMENTED|DEMO_VERIFIED|OperationsPanel.tsx: 수신 위험 경보 목록; 운영 위험판정은 Core 의존|
|ALERT-02|IMPLEMENTED|DEMO_VERIFIED|OperationsPanel.tsx: 수신 경보·장비 지연/두절 표시; 현장 경보 전달은 별도|
|ALERT-03|PARTIAL|DEMO_VERIFIED|telemetryStream.ts applyTelemetrySafetyRules: 수신 위험면 진입/접근 경보 구현; 화선 LineString 접근·운영 전달/ACK 미연결|
|ALERT-04|IMPLEMENTED|DEMO_VERIFIED|OperationsPanel.tsx activeAlerts: 심각도·발령시각 정렬; 확인/해제는 DEMO 세션만|
|NET-01|PARTIAL|DEMO_VERIFIED|LivePositionMap.tsx topologyEdges: DB 연결 없으면 기준 연결 추정; 실제 종단 경로 검증 필요|
|NET-02|IMPLEMENTED|DEMO_VERIFIED|OperationsPanel.tsx: lastReceivedAt·observedAt 표시; 실제 수신 주체 확인 필요|
|NET-03|IMPLEMENTED|DEMO_VERIFIED|operationalEvidence.ts classifyLinkHealth 및 테스트: 목표주기 대비 1.5배/3배 판정|
|NET-04|PARTIAL|DEMO_VERIFIED|OperationsPanel.tsx API 가용률 표시; 수신 표본 비율은 운영시간 기반 공식 가용률과 다름|
|NET-05|PARTIAL|DEMO_VERIFIED|operationalEvidence.ts: 지연·표본간 공백 계산; 장비별 평균/최대 갱신주기 공식 시험 미완|
|DEM-01|PARTIAL|EXTERNAL_PENDING|public/dem/36607/README.txt: 덕숭산 공개DEM 90m 적용; 기관 고해상도 실증 원본은 대기|
|DEM-02|IMPLEMENTED|DEMO_VERIFIED|LivePositionMap.tsx raster-dem / public/dem/36607: 덕숭산 90m Terrarium 타일 적용|
|DEM-03|PARTIAL|DEMO_VERIFIED|LivePositionMap.tsx 고도·hillshade 구현; 경사면은 입력 GeoJSON 표시, DEM 경사 분석 엔진 없음|
|DEM-04|IMPLEMENTED|OPERATING|LivePositionMap.tsx setTerrain / pitch·bearing: 2D/3D 전환|
|DEM-05|PARTIAL|DEMO_VERIFIED|LivePositionMap.tsx Viewshed·통신음영 입력면 표시; 실지형 가시권/전파해석 계산 엔진 없음|
|RESP-01|PARTIAL|DEMO_VERIFIED|LivePositionMap.tsx wildfire-risk-zones 표시; 운영 hazard-zone 조회·승인 계약 미연결|
|RESP-02|PARTIAL|DEMO_VERIFIED|LivePositionMap.tsx evacuation-routes 표시; DEMO 경로, 실제 안전성/지휘 승인 및 API 필요|
|RESP-03|PARTIAL|DEMO_VERIFIED|LivePositionMap.tsx suppression-resources 표시; 운영 진화자원 배치 연계 대기|
|RESP-04|PARTIAL|DEMO_VERIFIED|LivePositionMap.tsx water-sources 표시; 실제 취수 가용성·위치 API 대기|
|RESP-05|PARTIAL|DEMO_VERIFIED|LivePositionMap.tsx nearby-response-resources 표시; 기관 자원/ETA 운영 연계 대기|
|KPI-01|PARTIAL|DEMO_VERIFIED|operationalEvidence.ts 평균 전송지연은 갱신주기와 다름; 계획 강화목표 ≤3초 공식 검증 별도|
|KPI-02|PARTIAL|DEMO_VERIFIED|buildOperationalEvidence 시작·완료 시각 차 계산; 실제 차량도착/망준비 증적 미연결, 강화목표 ≤7분|
|KPI-03|PARTIAL|DEMO_VERIFIED|calculateTelemetryMetrics 표본 비율은 메시지/영상/위치 전체 송수신 성공률 아님; 송신 분모·ACK 필요|
|KPI-04|PARTIAL|DEMO_VERIFIED|calculateTelemetryMetrics 수신 표본 비율; 총 운영/중단시간 기반 공식 가용률 미구현|
|KPI-05|PARTIAL|DEMO_VERIFIED|buildOperationalEvidence 표본·식별자·FNV 체크섬 내보내기; 공인시험·실비행 증적 및 서명 없음|

## KPI 의미와 한계

공식 RFP: ≤10분 / ≤5초 / ≥98% / ≥98%. 연구개발계획 강화 목표: ≤7분 / ≤3초 / ≥98% / ≥98%. 순서는 망 구축 / 위치 갱신 / 정보공유 / 망 가용률.
전송 지연은 위치 갱신주기와 다르다. 수신 sequence/목표주기 표본 비율은 전체 메시지·영상·위치 전달률이나 운영시간 가용률이 아니다. 기존 계산은 참고 지표로만 남기고 자동 공식 판정 표현을 제거했다. 실제 구축 시작/완료 시각이 없으면 null이며 6.4분을 생성하지 않는다.

## 미사용 프로토타입

DomainFeatureModals.tsx는 src에서 import되지 않는다. 인증모듈·DEM 5m·99.8% 등의 고정 문구가 있어 운영 연결/증거에서 제외했다. 이번 변경에서 삭제하거나 연결하지 않았다.

## 운영 의존사항

- 실제 영상 브라우저 재생 변환 모듈, 보고 송신/경보 ACK·감사 API.
- 화선 LineString 접근 판정·안전경로 지휘 승인. 위험면 진입 판정은 telemetryStream.ts에 이미 존재한다.
- auth/role API·RBAC·전체 사건 복기는 별도 미완 범위.
- AI-RAN scheduler·본딩·자동절체·PTT·경량전송·QoS는 Backend/HW 의존.
- FIRMS 등 공공데이터 조회와 산불상황관제/다부처 자원배치 연계는 별도다.
- 고해상도 기관 DEM, 실기체/GNSS·RTK, 기관 승인 및 공인 KPI 현장 시험 필요.
