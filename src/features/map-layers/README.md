# features/map-layers — GeoJSON/MapLibre 표현 경계

위치·화선·위험구역·토폴로지를 레이어별 adapter로 분리하기 위한 위치다. 현재 실제 MapLibre source/layer 생성과 클릭 처리는 `features/disaster-dashboard/LivePositionMap.tsx`에 있다. 3D 지형과 대용량 레이어 성능은 미검증이다.
