# 장비 등록 및 업체 연결 화면

## 목적

Dashboard Frontend는 Core 서버와만 통신한다.

Vendor 서비스는 현장 장비와 Core 사이의 프록시/연계 계층이며,
브라우저에서 Vendor API를 직접 호출하지 않는다.

## 등록 흐름

```text
Frontend
  ↓
GET /api/v1/dashboard/asset-types
  ↓
POST /api/v1/dashboard/assets
  ↓
Core asset 생성 + vendor_device_mapping 저장
  ↓
assetId UUID 발급
  ↓
GET /api/v1/dashboard/assets/{assetId}
  ↓
등록 완료
```

## Frontend ↔ Core API

### 장비 유형 조회

```http
GET https://api.forest.tobeunicorn.kr/api/v1/dashboard/asset-types
```

응답의 `asset_type_id`를 등록 요청의 `assetTypeId`로 사용한다.

### 물리 장비 등록 + 업체 연결

```http
POST https://api.forest.tobeunicorn.kr/api/v1/dashboard/assets
Content-Type: application/json
```

Core는 물리 장비와 업체 장비번호 매핑을 하나의 등록 트랜잭션으로 저장한다.

정상 응답은 `201 Created`이며,
`data.asset_id`가 Core가 발급한 UUID다.

Frontend는 UUID를 직접 생성하지 않는다.

### 등록 결과 조회

```http
GET https://api.forest.tobeunicorn.kr/api/v1/dashboard/assets/{assetId}
```

등록 직후 Core 저장 결과 확인에 사용한다.

## 성공 기준

Frontend의 등록 성공 기준은 다음과 같다.

- Core 장비 등록 성공
- assetId 발급 확인
- vendor mapping 저장 확인
- Core 저장 결과 조회

Vendor의 `/register` 또는 내부 캐시 상태는
Frontend 성공 판정 기준에 포함하지 않는다.

## 시스템 경계

```text
현장 장비
   ↕
Vendor Integration
   ↕
Core Server
   ↕
Dashboard Frontend
```

Dashboard 브라우저는 Vendor Integration을 직접 호출하지 않는다.

## 환경 변수

```env
VITE_DASHBOARD_API_BASE_URL=https://api.forest.tobeunicorn.kr
```

## 검증

```powershell
npm test
npm run build
```

운영 확인 순서:

1. 자산 등록·관리 화면 진입
2. 장비 유형 목록 로딩 확인
3. 필수값 입력
4. 등록 및 업체 연결 실행
5. Core 201 확인
6. assetId 표시 확인
7. 업체 매핑 상태 확인
8. 등록 완료 표시 확인
