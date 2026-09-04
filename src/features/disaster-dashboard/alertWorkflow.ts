export type AlertWorkflowStatus = "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";
export type AlertWorkflowAction = "ACKNOWLEDGE" | "RESOLVE";

export function transitionAlert(current: AlertWorkflowStatus, action: AlertWorkflowAction): AlertWorkflowStatus {
  if (action === "ACKNOWLEDGE" && current === "ACTIVE") return "ACKNOWLEDGED";
  if (action === "RESOLVE" && (current === "ACTIVE" || current === "ACKNOWLEDGED")) return "RESOLVED";
  return current;
}

export function createAlertAudit(alertId: string, action: AlertWorkflowAction, actor: string, at = new Date()) {
  return { auditId: `${alertId}-${at.getTime()}-${action}`, alertId, action, actor, occurredAt: at.toISOString() };
}
