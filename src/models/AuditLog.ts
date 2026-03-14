import mongoose, { Schema, Document } from "mongoose";

export interface IAuditLog extends Document {
  requestId: string;
  stage: string;
  ruleType: string;
  field?: string;
  result: "pass" | "fail" | "error";
  details?: string;
}

const AuditLogSchema = new Schema(
  {
    requestId: { type: String, required: true, index: true },
    stage: { type: String, required: true },
    ruleType: { type: String, required: true },
    field: { type: String },
    result: { type: String, enum: ["pass", "fail", "error"], required: true },
    details: { type: String },
  },
  { timestamps: true }
);

export const AuditLog = mongoose.models.AuditLog || mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);
