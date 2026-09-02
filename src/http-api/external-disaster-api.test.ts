import { describe, expect, it } from "vitest";
import { HttpApiError } from "./client";
import { externalIntegrationErrorMessage } from "./external-disaster-api";

describe("externalIntegrationErrorMessage", () => {
  it("등록되지 않은 서버 IP 오류를 운영자용 문구로 변환한다", () => {
    const error = new HttpApiError(502, {
      error: {
        message: "UNREGISTERED IP ERROR",
      },
    });

    expect(
      externalIntegrationErrorMessage(error),
    ).toBe(
      "외부기관 서버 접근 허용(IP 등록) 확인 필요",
    );
  });

  it("공급자 403 오류를 인증·권한 오류로 변환한다", () => {
    const error = new HttpApiError(502, {
      error: {
        message:
          "KFS wildfire risk request failed: HTTP 403",
      },
    });

    expect(
      externalIntegrationErrorMessage(error),
    ).toBe(
      "외부기관 API 인증·권한 확인 필요",
    );
  });

  it("브라우저 fetch 실패를 네트워크 오류로 변환한다", () => {
    expect(
      externalIntegrationErrorMessage(
        new TypeError("Failed to fetch"),
      ),
    ).toBe(
      "외부기관 응답 없음 또는 네트워크 연결 확인 필요",
    );
  });

  it("일반적인 5xx 오류를 외부기관 응답 오류로 변환한다", () => {
    const error = new HttpApiError(502, {
      error: {
        message: "upstream failure",
      },
    });

    expect(
      externalIntegrationErrorMessage(error),
    ).toBe("외부기관 응답 오류");
  });
});
