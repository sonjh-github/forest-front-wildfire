import { describe, expect, it } from "vitest";
import { REQUIREMENTS_READINESS, REQUIREMENT_TOTAL, requirementSummary } from "./requirementsReadiness";
import { runDemoAcceptance } from "./demoAcceptance";

describe("47개 요구사항 개발 증빙", () => {
  it("47개 항목을 중복 없이 관리한다", () => {
    expect(REQUIREMENTS_READINESS).toHaveLength(REQUIREMENT_TOTAL);
    expect(new Set(REQUIREMENTS_READINESS.map((item) => item.id)).size).toBe(REQUIREMENT_TOTAL);
  });

  it("모든 항목이 소프트웨어 구현 근거를 가진다", () => {
    expect(REQUIREMENTS_READINESS.every((item) => item.softwareComplete && item.evidence.length > 0)).toBe(true);
    expect(requirementSummary().softwareComplete).toBe(REQUIREMENT_TOTAL);
  });

  it("외부 승인·현장 검증을 운영 완료로 오인하지 않는다", () => {
    const pending = REQUIREMENTS_READINESS.filter((item) => item.validation.endsWith("PENDING"));
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((item) => item.validation !== "OPERATING")).toBe(true);
  });

  it("외부조건 7개를 제외한 40개 데모 수용조건을 자동 검증한다", () => {
    const report = runDemoAcceptance();
    expect(report.total).toBe(40);
    expect(report.failed).toBe(0);
    expect(requirementSummary()).toMatchObject({ operating: 3, demoVerified: 37, externalPending: 6, fieldPending: 1 });
  });
});
