export type InputFieldType = "string" | "number" | "boolean";
export type RuleType = "required_field" | "greater_than" | "equals" | "conditional";
export type TransitionCondition = "always" | "on_success" | "on_failure";
export type RequestInputMode = "guided" | "json";
export type GuideTone = "done" | "attention" | "tip";
export type WorkspaceView = "overview" | "builder" | "requests";
export type RequestStatus =
  | "processing"
  | "approved"
  | "rejected"
  | "manual_review"
  | "error";

export interface InputFieldDefinition {
  type: InputFieldType;
  required?: boolean;
  integer?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: Array<string | number | boolean>;
  description?: string;
}

export interface WorkflowRule {
  id: string;
  type: RuleType;
  field?: string;
  value?: unknown;
  onPass?: string;
  onFail?: string;
  subRules?: WorkflowRule[];
}

export interface WorkflowTransition {
  from: string;
  to: string;
  condition?: TransitionCondition;
}

export interface WorkflowStageAction {
  id: string;
  type: "fetch_external_score";
  targetField: string;
  processedFlagField?: string;
  historyMessage?: string;
}

export interface WorkflowStageActionEditor extends WorkflowStageAction {
  stage: string;
}

export interface WorkflowConfigSummary {
  name: string;
  version: number;
  isActive: boolean;
  inputFieldCount: number;
  stageActionCount: number;
  stageCount: number;
  ruleCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkflowConfigDetail {
  name: string;
  version: number;
  isActive: boolean;
  inputSchema?: {
    allowUnknown?: boolean;
    fields: Record<string, InputFieldDefinition>;
  };
  stageActions?: Record<string, WorkflowStageAction[]>;
  stages: string[];
  rules: Record<string, WorkflowRule[]>;
  transitions: WorkflowTransition[];
  createdAt?: string;
  updatedAt?: string;
}

export interface RequestSummaryResponse {
  requestId: string;
  status: RequestStatus;
  currentStage?: string;
  message?: string;
}

export interface RequestDetails {
  requestId: string;
  workflowName: string;
  workflowVersion: number;
  workflowSource: "database" | "registry";
  input: Record<string, unknown>;
  currentStage: string;
  status: RequestStatus;
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
  history: Array<{
    stage: string;
    action: string;
    timestamp: string;
  }>;
  reasoning: string;
}

export interface WorkflowComposerDraft {
  name: string;
  activate: boolean;
  allowUnknown: boolean;
  stagesText: string;
  inputFieldsText: string;
  stageActionsText: string;
  rulesText: string;
  transitionsText: string;
}

export interface RequestConsoleDraft {
  workflowName: string;
  workflowVersion?: number;
  idempotencyKey: string;
  inputDataText: string;
  requestIdLookup: string;
  inputMode: RequestInputMode;
}

export interface Notice {
  tone: "success" | "error" | "info";
  message: string;
}

export interface JsonParseResult<T> {
  value: T;
  error: string | null;
}

export interface ComposerSections {
  stages: string[];
  inputFields: Record<string, InputFieldDefinition>;
  stageActions: Record<string, WorkflowStageAction[]>;
  rules: Record<string, WorkflowRule[]>;
  transitions: WorkflowTransition[];
  errors: {
    inputFields: string | null;
    stageActions: string | null;
    rules: string | null;
    transitions: string | null;
  };
}
