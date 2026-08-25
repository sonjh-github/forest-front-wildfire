# app — 애플리케이션 조립 경계

향후 라우팅·전역 provider·권한별 shell을 분리하기 위한 설계 위치다. 현재는 별도 app 모듈이 구현되지 않았고 `src/App.tsx`가 `UnifiedDisasterDashboard`를 직접 조립한다. 이 디렉터리를 구현 완료 영역으로 간주하지 않는다.
