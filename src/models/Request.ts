import mongoose, { Schema, Document } from "mongoose";

export interface IRequest extends Document {
  requestId: string;
  idempotencyKey: string;
  workflowName: string;
  workflowVersion: number;
  workflowSource: "database" | "registry";
  workflowConfigSnapshot?: Record<string, unknown>;
  input: Record<string, any>;
  currentStage: string;
  status: "processing" | "approved" | "rejected" | "manual_review" | "error";
  history: Array<{
    stage: string;
    action: string;
    timestamp: Date;
  }>;
  rulesTriggered: Array<{
    ruleId: string;
    passed: boolean;
    details?: string;
  }>;
  decisions: Array<{
    stage: string;
    decision: string;
    reasoning?: string;
  }>;
  reasoning: string;
}

const RequestSchema = new Schema(
  {
    requestId: { type: String, required: true, unique: true },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    workflowName: { type: String, required: true },
    workflowVersion: { type: Number, required: true, min: 0, default: 0 },
    workflowSource: {
      type: String,
      enum: ["database", "registry"],
      required: true,
      default: "registry",
    },
    workflowConfigSnapshot: { type: Schema.Types.Mixed },
    input: { type: Schema.Types.Mixed, required: true },
    currentStage: { type: String, required: true },
    status: {
      type: String,
      enum: ["processing", "approved", "rejected", "manual_review", "error"],
      default: "processing",
    },
    history: [
      {
        stage: String,
        action: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
    rulesTriggered: [
      {
        ruleId: String,
        passed: Boolean,
        details: String,
      },
    ],
    decisions: [
      {
        stage: String,
        decision: String,
        reasoning: String,
      },
    ],
    reasoning: { type: String, default: "" },
  },
  { timestamps: true }
);

export const Request = mongoose.models.Request || mongoose.model<IRequest>("Request", RequestSchema);
