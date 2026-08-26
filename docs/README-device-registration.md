# 장비 등록 및 업체 연결 화면

## 목적

이 화면은 물리 장비를 Core 자산 원장에 등록하고, 같은 요청에서 업체 장비번호와 `assetId`를 연결한 뒤 Vendor 서버의 `/register`를 호출해 캐시의 `MAPPED` 상태까지 확인한다.

사용자가 API 단계를 하나씩 실행하지 않고 **등록 및 업체 연결** 버튼 한 번으로 아래 흐름을 수행한다.

```text
장비 유형 조회
→ Core에 물리 장비 등록 + vendor_device_mapping 저장
→ Core가 assetId UUID 발급
→ Vendor /register 호출
→ registrationStatus=MAPPED 확인
→ 사용 가능
```

## API

### 장비 유형 조회

```http
GET https://api.forest.tobeunicorn.kr/api/v1/dashboard/asset-types
```

응답의 `asset_type_id`를 등록 요청의 `assetTypeId`로 사용한다. 장비 유형 이름은 화면 표시용이며 등록 키로 사용하지 않는다.

### 물리 장비 등록 + 업체 연결

```http
POST https://api.forest.tobeunicorn.kr/api/v1/dashboard/assets
Content-Type: application/json
```

예시:

```json
{
  "assetCode": "DASH-RTK-01",
  "assetTypeId": "00000000-0000-0000-0000-000000000000",
  "assetName": "진화대원 RTK 단말 1호",
  "status": "READY",
  "productName": "RTK Terminal",
  "modelName": "MODEL-A",
  "specifications": {
    "firmware": "1.0.0"
  },
  "vendor": "JININFRA",
  "vendorDeviceId": "RTK-TERM-001",
  "deviceType": "RTK_TERMINAL",
  "mappingStatus": "ACTIVE"
}
```

정상 응답은 `201 Created`이며 `data.asset_id`가 Core가 발급한 UUID다. 프론트는 UUID를 생성하지 않는다.

Core에서는 `asset`과 `vendor_device_mapping`을 하나의 등록 트랜잭션으로 처리한다. `assetCode` 중복은 `409 ASSET_CODE_CONFLICT`, 이미 연결된 업체 장비 ID는 `409 VENDOR_DEVICE_CONFLICT`가 될 수 있다.

### 등록 장비 조회

```http
GET https://api.forest.tobeunicorn.kr/api/v1/dashboard/assets/{assetId}
```

등록 직후 화면에서 Core 저장 결과를 다시 확인할 때 사용한다.

### Vendor 캐시 확인

```http
POST https://device.forest.tobeunicorn.kr/ndps/register
POST https://device.forest.tobeunicorn.kr/jininfra/register
```

단일 장비를 확인할 때 프론트는 다음 형식으로 요청한다.

```json
{
  "vendor": "JININFRA",
  "reportedByDeviceId": "RTK-TERM-001",
  "observedAt": "2026-08-25T07:00:00.000Z",
  "devices": [
    {
      "vendorDeviceId": "RTK-TERM-001",
      "deviceType": "RTK_TERMINAL",
      "modelName": "MODEL-A"
    }
  ]
}
```

`registrationStatus`가 `MAPPED`일 때만 화면을 **사용 가능**으로 표시한다. Core에서 UUID가 발급됐더라도 Vendor 확인이 실패하거나 `UNMAPPED`이면 **연결 오류**로 표시한다.

Vendor 캐시는 서버 재시작 시 비워질 수 있으므로 등록 결과 카드의 **업체 캐시 다시 확인** 버튼으로 `/register`를 재호출할 수 있다.

## 현재 Vendor deviceType 참고값

현재 Vendor 서비스 계약 코드에서 확인되는 값이다. 프론트는 추천값으로 보여주되 직접 입력도 허용한다.

### NDPS

- `TVWS_BASE`
- `TVWS_CPE`
- `TVWS_NMS`
- `BACKHAUL_ROUTER`
- `COMMUNICATION_VEHICLE`
- `OTHER`

### JININFRA

- `RTK_TERMINAL`
- `RTK_LPWA_GATEWAY`
- `RTK_BASE_STATION`
- `NETWORK_CONTROLLER`
- `BACKHAUL_ROUTER`
- `COMMUNICATION_VEHICLE`
- `OTHER`

> 받은 등록 매뉴얼의 예시에는 `NDPS + UAV` 조합이 있으나, 현재 Vendor 서비스의 NDPS `/register` 검증 목록에는 `UAV`가 포함되어 있지 않다. 화면에서 이를 하드 차단하지 않고 실제 `/register` 응답을 최종 기준으로 사용한다. Backend 계약이 변경되면 추천 목록을 맞춰 갱신한다.

## 화면 상태

| 화면 상태 | 기준 |
|---|---|
| 등록 전 | Core 등록 요청 전 |
| 전산 등록·업체 연결 | Core `POST /dashboard/assets` 성공, `assetId` 발급 |
| 사용 가능 | Vendor `/register` 응답 `MAPPED` |
| 연결 오류 | Vendor `/register` 실패, `UNMAPPED`, 또는 네트워크/CORS 오류 |

## 환경 변수

```env
VITE_DASHBOARD_API_BASE_URL=https://api.forest.tobeunicorn.kr
VITE_DEVICE_API_BASE_URL=https://device.forest.tobeunicorn.kr
```

`VITE_DEVICE_API_BASE_URL`을 생략하면 위 운영 주소를 기본값으로 사용한다.

Vite 환경 변수는 빌드 시점에 정적 번들에 주입된다.

## 보안

Dashboard 쓰기 API는 익명 공개용으로 사용하지 않는다. 운영 환경에서 인증·인가 계층이 활성화된 경우 프론트 요청도 해당 정책을 따라야 한다.

Vendor `/register`를 브라우저에서 직접 호출하려면 Vendor 도메인의 CORS 정책이 `https://wildfire.forest.tobeunicorn.kr`를 허용해야 한다. CORS가 허용되지 않은 경우 Core 등록은 성공할 수 있지만 Vendor 캐시 확인만 실패하며, 화면은 이를 별도 상태로 표시한다.

## 검증

```powershell
npm test
npm run build
```

운영 확인 순서:

1. `자산 등록·관리` 클릭
2. 장비 유형 목록 로딩 확인
3. 필수값 입력 후 `등록 및 업체 연결`
4. Core `201 Created` 확인
5. `assetId` 표시 확인
6. Vendor `registrationStatus=MAPPED` 확인
7. 필요하면 `업체 캐시 다시 확인` 실행

## 구현 파일

- `src/features/disaster-dashboard/AssetRegistryModal.tsx`
- `src/http-api/device-registration-api.ts`
- `src/http-api/device-registration-api.test.ts`
- `src/vite-env.d.ts`
