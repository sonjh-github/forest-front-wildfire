import { describe, expect, it } from "vitest";
import { createAlertAudit, transitionAlert } from "./alertWorkflow";

describe("관제 경보 처리 흐름", () => {
  it("발령 경보를 확인 후 해제한다", () => {
    expect(transitionAlert("ACTIVE", "ACKNOWLEDGE")).toBe("ACKNOWLEDGED");
    expect(transitionAlert("ACKNOWLEDGED", "RESOLVE")).toBe("RESOLVED");
  });

  it("해제된 경보는 다시 확인 상태로 되돌리지 않는다", () => {
    expect(transitionAlert("RESOLVED", "ACKNOWLEDGE")).toBe("RESOLVED");
  });

  it("조치자·시각을 포함한 감사 이력을 생성한다", () => {
    expect(createAlertAudit("ALT-1", "ACKNOWLEDGE", "DEMO 관제자", new Date("2026-09-04T01:00:00Z"))).toMatchObject({ alertId: "ALT-1", action: "ACKNOWLEDGE", actor: "DEMO 관제자", occurredAt: "2026-09-04T01:00:00.000Z" });
  });
});
