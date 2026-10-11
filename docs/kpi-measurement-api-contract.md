# KPI 측정 API 증빙 계약

운영 화면은 `GET /api/v1/events/{eventId}/kpis?limit=100`을 주기적으로 조회한다. 다음 필드가 모두 확인된 최신 레코드만 공식 PASS/FAIL 판정에 사용한다.

| 필드 | 의미 |
| --- | --- |
| `metricCode` | `NETWORK_DEPLOYMENT_TIME`, `LOCATION_LATENCY`, `SHARING_SUCCESS`, `NETWORK_AVAILABILITY` 중 하나 |
| `measuredValue` | Core가 계산·저장한 측정값 |
| `unit` | `분`, `초`, `%` |
| `testRunId` | 현장 또는 시험실 측정 실행의 불변 식별자 |
| `measurementSource` | 측정 생성 시스템 및 방법 식별자 |
| `rawLogRefs` | Core가 보관하는 원시로그의 조회 가능한 참조 목록 |
| `verificationStatus` | 검증 완료 시 정확히 `VERIFIED` |
| `receivedAt` | Core가 해당 측정 레코드를 최근 확인한 ISO-8601 시각 |

예시:

```json
{
  "metricCode": "SHARING_SUCCESS",
  "measuredValue": 98.8,
  "unit": "%",
  "testRunId": "RUN-20261011-001",
  "measurementSource": "CORE_MESSAGE_ACK_AGGREGATE",
  "rawLogRefs": ["evidence://RUN-20261011-001/message-ack.ndjson"],
  "verificationStatus": "VERIFIED",
  "receivedAt": "2026-10-11T06:00:09.000Z"
}
```

## 판정 규칙

- 한 필드라도 없으면 값은 `UNVERIFIED`이며 공식 PASS로 판정하지 않는다.
- `receivedAt`이 현재 시각보다 미래이거나 15초 이상 오래되면 `STALE`로 처리하고 현재 실측값 영역에서 숨긴다.
- API 오류 시 이전 응답을 현재 실측값으로 재사용하지 않는다.
- `synthetic`, `previewOnly`, DEMO/SIMULATION/PREVIEW 출처는 명시적 DEMO 화면에서만 표시하며 공식 판정에서 제외한다.
- 브라우저 텔레메트리 표본과 측정 제어 버튼으로 만든 값은 `REFERENCE`이다. Core 원시로그를 대신하지 않는다.
- 프론트엔드는 `rawLogRefs`를 임의 생성하지 않으며 원시로그의 존재 또는 무결성을 독자적으로 보증하지 않는다.

## Core 후속 구현

Core는 네 KPI별 최신 측정 레코드와 위 증빙 필드를 함께 반환해야 한다. 특히 정보공유 성공률은 송신 시도와 수신/ACK 원시로그, 가용률은 NMS `UP/DOWN` 원시 이벤트, 위치 갱신은 대원·차량 원시 위치 이벤트, 구축시간은 시험 실행의 시작·망 준비 완료 이벤트와 연결되어야 한다.
