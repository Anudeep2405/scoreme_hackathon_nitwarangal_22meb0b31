import mongoose, { Schema, Document } from "mongoose";

export interface IWorkflowConfig extends Document {
  name: string;
  stages: string[];
  rules: Record<string, any[]>;
  transitions: any[];
}

const WorkflowConfigSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    stages: { type: [String], required: true },
    rules: { type: Schema.Types.Mixed, required: true },
    transitions: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

export const WorkflowConfig =
  mongoose.models.WorkflowConfig || mongoose.model<IWorkflowConfig>("WorkflowConfig", WorkflowConfigSchema);
