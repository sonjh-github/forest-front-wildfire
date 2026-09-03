# 산림청 통합상황판 운영 준비 체크리스트

## 배포 승인 전

- `npm test`, `npm run build`, Docker 이미지 검증 통과
- `/?demo=1`에서 DEMO 표식, 지도 레이어, 3D, 경보, 통신망, KPI 확인
- 운영 API URL이 `https://api.forest.tobeunicorn.kr`인지 확인
- API 키와 Supabase 비밀키가 프런트 빌드·GitHub 소스에 포함되지 않았는지 확인

## 외부 API 승인 후

- 키는 Core 서버 환경변수 또는 배포 Secret에만 등록
- FIRMS 화점 좌표·취득시각·신뢰도 표출 확인
- 산림청 산불위험 및 산사태 자료의 행정구역 매칭 확인
- 오류 시 마지막 정상 데이터 유지 및 운영자 메시지 확인

## 실장비 시험

- Gateway → Backend → Frontend 위치 갱신 3초 이하
- MAVLink 위치·고도·비행모드·ARM·임무·비상 상태 대사
- 장비별 마지막 수신, 지연, 손실, 연결·미연결 판정 확인
- 2시간 이상 시험에서 네트워크 가용률 98% 이상
- 시험 ID, 원시로그, 측정구간, 판정값을 KPI 증적에 연결

## 장애·복구 시험

- 외부 API 차단 시 관제 화면과 현장 자산이 유지되는지 확인
- 지도 타일 차단 시 좌표·마커·레이어가 유지되는지 확인
- Gateway 중단·재기동 후 동일 assetId로 수신이 복구되는지 확인
- 중복 메시지가 Idempotency-Key로 중복 저장되지 않는지 확인

## 시연 당일

- 기본 진입: `https://wildfire.forest.tobeunicorn.kr/?demo=1`
- 예비 브라우저와 유선망 준비
- 시연 순서: 지도 레이어 → 드론 → 경보 → 통신망 → 3D → KPI
- DEMO 자료가 공식 실측값이 아님을 화면 표식과 설명으로 고지
