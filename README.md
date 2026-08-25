# forest-front-demo — 산림재난 통합상황판

산불·산사태 사건의 현장 인원, 장비, 통신망, 경보와 분석 결과를 하나의 지도 중심 화면에서 확인하기 위한 React·TypeScript·MapLibre 상황판이다. 산림청 상황실·지휘 담당자의 사용을 가정한 실증 UI이며 실제 기관 사용자 인수는 아직 수행되지 않았다.

## 화면이 해결하는 문제

- 서로 다른 장비 상태를 사건·시각·위치 기준으로 한 화면에 결합한다.
- 값은 바뀌었지만 사용자가 변화를 놓치는 문제를 지도 테두리 강조로 보완한다.
- 데이터 연결 실패 시 빈 화면으로 교체하지 않고 마지막 정상 상태를 유지한다.
- 자산 마커에서 데이터 발생 장비와 API 보고 gateway 경로를 확인한다.

## 구현 구조

| 파일 | 책임 |
|---|---|
| `UnifiedDisasterDashboard.tsx` | 사건 선택, polling, 데이터 조합, 변화 감지와 dialog 상태 |
| `LivePositionMap.tsx` | MapLibre source/layer, 자원 마커, halo, 토폴로지 상호작용 |
| `OperationsPanel.tsx` | 자원·통신망·운영 현황과 레이어 제어 |
| `MapTimelinePlayer.tsx` | 과거 시점 재생과 현재 상태 복귀 |
| `AssetRegistryModal.tsx` | 통합 자산 사전등록 |
| `HardwareServerPanel.tsx` | GCS·하드웨어 서버 상태 |
| `http-api/forest-api.ts` | 여러 업무 API를 사건 overview로 조합 |

## 주요 UX 판단

- 화면의 현재 실시간 방식은 1초 HTTP polling이다.
- 최신 관측시각 또는 위치 fingerprint가 바뀌면 마커를 강조한다.
- 강조시간은 실제 갱신 간격의 0.3배이며 300ms~3초로 제한한다.
- 지도 효과는 `prefers-reduced-motion`을 고려한다.
- API 오류가 발생하면 마지막 정상 overview와 재연결 안내를 함께 표시한다.
- 타일 네트워크 오류는 업무 데이터 오류와 분리해 degraded 상태로 처리한다.

## 실행

```powershell
npm.cmd install
npm.cmd run dev
```

기본 주소는 `http://127.0.0.1:15173`이다. API 주소는 `VITE_API_BASE_URL`로 주입하며 프론트 환경에 Supabase 서버 키를 넣지 않는다.

## 검증

```powershell
npm.cmd test
npm.cmd run build
```

현재 자동 테스트는 HTTP 헤더, 204 처리와 구조화된 4xx/5xx 오류를 확인한다. TypeScript와 Vite 프로덕션 빌드도 루트 테스트에 포함된다.

## 확인되지 않은 영역

- 실제 상황실 사용자 사용성·접근성 평가
- 브라우저 E2E와 시각 회귀 테스트
- 마커 100~1000개 부하와 지도 FPS
- 3D 지형·고도·화선 렌더링
- 역할별 화면과 모바일 저대역 모드
- WebSocket/SSE push와 오프라인 캐시

`src/entities`, `src/pages`, 일부 `src/features`와 `src/shared`의 README는 향후 모듈 분리 경계를 설명한다. 해당 디렉터리에 README만 있는 경우 구현 완료 기능을 의미하지 않는다.
