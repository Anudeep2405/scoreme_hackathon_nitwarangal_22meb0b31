import mongoose, { Model, Schema, Document } from "mongoose";
import { StageAction, WorkflowInputSchema } from "@/config/workflows";

export interface IWorkflowConfig extends Document {
  name: string;
  version: number;
  isActive: boolean;
  inputSchema?: WorkflowInputSchema;
  stageActions?: Record<string, StageAction[]>;
  stages: string[];
  rules: Record<string, unknown[]>;
  transitions: unknown[];
}

const WorkflowConfigSchema = new Schema(
  {
    name: { type: String, required: true, index: true },
    version: { type: Number, required: true, min: 1, default: 1 },
    isActive: { type: Boolean, required: true, default: true },
    inputSchema: { type: Schema.Types.Mixed },
    stageActions: { type: Schema.Types.Mixed },
    stages: { type: [String], required: true },
    rules: { type: Schema.Types.Mixed, required: true },
    transitions: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

WorkflowConfigSchema.index({ name: 1, version: 1 }, { unique: true });
WorkflowConfigSchema.index({ name: 1, isActive: 1, version: -1 });

export const WorkflowConfigModel =
  (mongoose.models.WorkflowConfig as Model<IWorkflowConfig>) ||
  mongoose.model<IWorkflowConfig>("WorkflowConfig", WorkflowConfigSchema);

export const WorkflowConfig = WorkflowConfigModel;
