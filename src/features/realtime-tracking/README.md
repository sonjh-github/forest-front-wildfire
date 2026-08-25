# features/realtime-tracking — 갱신·변화 감지 경계

현재 위치 추적은 `UnifiedDisasterDashboard.tsx`의 1초 HTTP 폴링과 관측시각/fingerprint 비교로 구현되어 있다. 갱신 간격의 0.3배 동안 지도 테두리를 강조한다. WebSocket·SSE·Supabase Realtime과 오프라인 동기화는 아직 구현되지 않았다.
