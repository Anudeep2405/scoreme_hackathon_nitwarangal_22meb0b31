import { AuditLog } from "@/models/AuditLog";
import logger from "@/lib/logger";

export async function logAuditEvent(data: {
  requestId: string;
  stage: string;
  ruleType: string;
  field?: string;
  result: "pass" | "fail" | "error";
  details?: string;
}) {
  // Log strictly
  logger.info(`Audit: [${data.requestId}] ${data.stage} - ${data.ruleType} (${data.result})`, data);

  // Store defensively
  try {
    await AuditLog.create(data);
  } catch (error) {
    logger.error(`Failed to save audit log for request ${data.requestId}`, { error });
  }
}
