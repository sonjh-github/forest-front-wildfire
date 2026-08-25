# shared/hooks — 재사용 상태·조회 계획

polling, 마지막 정상 데이터, 변경 강조와 화면 크기 대응을 hook으로 분리하기 위한 위치다. 현재 해당 로직은 `UnifiedDisasterDashboard.tsx`의 effect와 callback에 통합되어 있다.
