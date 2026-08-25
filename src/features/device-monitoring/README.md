# features/device-monitoring — 장비 관제 기능 경계

장비 상태·배터리·마지막 수신·통신 경로를 전용 기능으로 분리하기 위한 위치다. 현재 구현은 `HardwareServerPanel.tsx`, `OperationsPanel.tsx`와 지도 마커에 분산되어 있다. 별도 기능 모듈화와 장비별 장애 규칙은 남은 과제다.
