"use client";

import { useEffect, useState } from "react";
import { WorkflowConsoleBuilder } from "./workflow-console-builder";
import styles from "./workflow-console.module.css";
import { WorkflowConsoleOverview } from "./workflow-console-overview";
import { WorkflowConsoleRequestRunner } from "./workflow-console-request-runner";
import { WorkflowConsoleSidebar } from "./workflow-console-sidebar";
import {
  ComposerSections,
  InputFieldDefinition,
  InputFieldType,
  JsonParseResult,
  Notice,
  RequestConsoleDraft,
  RequestDetails,
  RequestSummaryResponse,
  RuleType,
  WorkflowComposerDraft,
  WorkflowConfigDetail,
  WorkflowConfigSummary,
  WorkflowRule,
  WorkflowStageAction,
  WorkflowStageActionEditor,
  WorkflowTransition,
  WorkspaceView,
} from "./workflow-console.types";
import {
  buildRequestSample,
  countNestedRules,
  createWorkflowKey,
  stringifyJson,
} from "./workflow-console.utils";

const statusTargets = [
  "approved_status",
  "rejected_status",
  "manual_review_status",
  "error_status",
] as const;

const starterWorkflowConfig = {
  name: "loan_application",
  inputSchema: {
    allowUnknown: false,
    fields: {
      amount: {
        type: "number" as const,
        required: true,
        min: 1,
        description: "Requested loan amount",
      },
      credit_score: {
        type: "number" as const,
        required: true,
        integer: true,
        min: 300,
        max: 850,
        description: "Applicant credit score",
      },
      external_verification: {
        type: "string" as const,
        required: true,
        enum: ["passed", "failed", "pending"],
        description: "Result from the external verification provider",
      },
    },
  },
  stageActions: {
    scoring: [
      {
        id: "action_scoring_1",
        type: "fetch_external_score" as const,
        targetField: "external_score",
        processedFlagField: "external_score_processed",
        historyMessage: "Fetched external score",
      },
    ],
  },
  stages: ["intake", "scoring", "decision"],
  rules: {
    intake: [
      {
        id: "rule_intake_1",
        type: "required_field" as const,
        field: "amount",
      },
      {
        id: "rule_intake_2",
        type: "required_field" as const,
        field: "credit_score",
      },
      {
        id: "rule_intake_3",
        type: "greater_than" as const,
        field: "amount",
        value: 0,
      },
    ],
    scoring: [
      {
        id: "rule_scoring_1",
        type: "conditional" as const,
        onPass: "decision",
        onFail: "rejected_status",
        subRules: [
          {
            id: "sub_scoring_1",
            type: "greater_than" as const,
            field: "credit_score",
            value: 600,
          },
        ],
      },
    ],
    decision: [
      {
        id: "rule_decision_1",
        type: "equals" as const,
        field: "external_verification",
        value: "passed",
      },
    ],
  },
  transitions: [
    {
      from: "intake",
      to: "scoring",
      condition: "on_success" as const,
    },
    {
      from: "scoring",
      to: "decision",
      condition: "on_success" as const,
    },
  ],
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createIdempotencyKey() {
  return `ui-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createEditorId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function valueToEditorString(value: unknown) {
  if (value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return stringifyJson(value);
}

function safeParseJsonBlock<T>(source: string, fallback: T, label: string): JsonParseResult<T> {
  const trimmed = source.trim();

  if (!trimmed) {
    return {
      value: fallback,
      error: null,
    };
  }

  try {
    return {
      value: JSON.parse(trimmed) as T,
      error: null,
    };
  } catch {
    return {
      value: fallback,
      error: `${label} JSON is invalid. Guided edits will reset it to a valid shape.`,
    };
  }
}

function parseJsonBlock<T>(source: string, label: string, fallback: T): T {
  const result = safeParseJsonBlock(source, fallback, label);
  if (result.error) {
    throw new Error(`${label} must be valid JSON.`);
  }

  return result.value;
}

function normalizeRulesForStages(
  rules: Record<string, WorkflowRule[]>,
  stages: string[]
): Record<string, WorkflowRule[]> {
  return Object.fromEntries(stages.map((stage) => [stage, rules[stage] ?? []]));
}

function normalizeStageActionsForStages(
  stageActions: Record<string, WorkflowStageAction[]>,
  stages: string[]
) {
  return Object.fromEntries(
    stages
      .map((stage) => [stage, stageActions[stage] ?? []] as const)
      .filter(([, actions]) => actions.length > 0)
  );
}

function readComposerSections(draft: WorkflowComposerDraft): ComposerSections {
  const stages = draft.stagesText
    .split("\n")
    .map((stage) => stage.trim())
    .filter(Boolean);

  const inputFieldsResult = safeParseJsonBlock<unknown>(draft.inputFieldsText, {}, "Input fields");
  const stageActionsResult = safeParseJsonBlock<unknown>(
    draft.stageActionsText,
    {},
    "Stage actions"
  );
  const rulesResult = safeParseJsonBlock<unknown>(draft.rulesText, {}, "Rules");
  const transitionsResult = safeParseJsonBlock<unknown>(
    draft.transitionsText,
    [],
    "Transitions"
  );

  const inputFields = isObjectRecord(inputFieldsResult.value)
    ? (inputFieldsResult.value as Record<string, InputFieldDefinition>)
    : {};
  const stageActions = isObjectRecord(stageActionsResult.value)
    ? (stageActionsResult.value as Record<string, WorkflowStageAction[]>)
    : {};
  const rules = isObjectRecord(rulesResult.value)
    ? (rulesResult.value as Record<string, WorkflowRule[]>)
    : {};
  const transitions = Array.isArray(transitionsResult.value)
    ? (transitionsResult.value as WorkflowTransition[])
    : [];

  return {
    stages,
    inputFields,
    stageActions,
    rules: normalizeRulesForStages(rules, stages),
    transitions,
    errors: {
      inputFields: inputFieldsResult.error,
      stageActions: stageActionsResult.error,
      rules: rulesResult.error,
      transitions: transitionsResult.error,
    },
  };
}

function writeComposerDraft(
  currentDraft: WorkflowComposerDraft,
  sections: Omit<ComposerSections, "errors">
): WorkflowComposerDraft {
  const normalizedRules = normalizeRulesForStages(sections.rules, sections.stages);
  const normalizedStageActions = normalizeStageActionsForStages(
    sections.stageActions,
    sections.stages
  );

  return {
    ...currentDraft,
    stagesText: sections.stages.join("\n"),
    inputFieldsText: stringifyJson(sections.inputFields),
    stageActionsText: stringifyJson(normalizedStageActions),
    rulesText: stringifyJson(normalizedRules),
    transitionsText: stringifyJson(sections.transitions),
  };
}

function flattenStageActions(
  stageActions: Record<string, WorkflowStageAction[]>
): WorkflowStageActionEditor[] {
  return Object.entries(stageActions).flatMap(([stage, actions]) =>
    actions.map((action) => ({
      ...action,
      stage,
    }))
  );
}

function groupStageActions(
  actions: WorkflowStageActionEditor[]
): Record<string, WorkflowStageAction[]> {
  const grouped: Record<string, WorkflowStageAction[]> = {};

  for (const action of actions) {
    const stage = action.stage.trim();
    if (!stage) {
      continue;
    }

    if (!grouped[stage]) {
      grouped[stage] = [];
    }

    grouped[stage].push({
      id: action.id,
      type: action.type,
      targetField: action.targetField,
      processedFlagField: action.processedFlagField,
      historyMessage: action.historyMessage,
    });
  }

  return grouped;
}

function renameRuleStageTargets(
  rules: WorkflowRule[],
  previousStage: string,
  nextStage: string
): WorkflowRule[] {
  return rules.map((rule) => ({
    ...rule,
    ...(rule.type === "conditional"
      ? {
          onPass: rule.onPass === previousStage ? nextStage : rule.onPass,
          onFail: rule.onFail === previousStage ? nextStage : rule.onFail,
        }
      : {}),
    ...(rule.subRules
      ? {
          subRules: renameRuleStageTargets(rule.subRules, previousStage, nextStage),
        }
      : {}),
  }));
}

function clearRuleStageTargets(rules: WorkflowRule[], removedStage: string): WorkflowRule[] {
  return rules.map((rule) => ({
    ...rule,
    ...(rule.type === "conditional"
      ? {
          onPass: rule.onPass === removedStage ? undefined : rule.onPass,
          onFail: rule.onFail === removedStage ? undefined : rule.onFail,
        }
      : {}),
    ...(rule.subRules
      ? {
          subRules: clearRuleStageTargets(rule.subRules, removedStage),
        }
      : {}),
  }));
}

function renameRuleFieldReferences(
  rules: WorkflowRule[],
  previousField: string,
  nextField: string
): WorkflowRule[] {
  return rules.map((rule) => ({
    ...rule,
    field: rule.field === previousField ? nextField : rule.field,
    ...(rule.subRules
      ? {
          subRules: renameRuleFieldReferences(rule.subRules, previousField, nextField),
        }
      : {}),
  }));
}

function renameObjectKey<T>(
  record: Record<string, T>,
  previousKey: string,
  nextKey: string
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key === previousKey ? nextKey : key, value])
  );
}

function updateRuleAtPath(
  rules: WorkflowRule[],
  path: number[],
  updater: (rule: WorkflowRule) => WorkflowRule
): WorkflowRule[] {
  return rules.map((rule, index) => {
    if (index !== path[0]) {
      return rule;
    }

    if (path.length === 1) {
      return updater(rule);
    }

    return {
      ...rule,
      subRules: updateRuleAtPath(rule.subRules ?? [], path.slice(1), updater),
    };
  });
}

function removeRuleAtPath(rules: WorkflowRule[], path: number[]): WorkflowRule[] {
  return rules.flatMap((rule, index) => {
    if (index !== path[0]) {
      return [rule];
    }

    if (path.length === 1) {
      return [];
    }

    return [
      {
        ...rule,
        subRules: removeRuleAtPath(rule.subRules ?? [], path.slice(1)),
      },
    ];
  });
}

function appendSubRuleAtPath(
  rules: WorkflowRule[],
  path: number[],
  nextRule: WorkflowRule
): WorkflowRule[] {
  return rules.map((rule, index) => {
    if (index !== path[0]) {
      return rule;
    }

    if (path.length === 1) {
      return {
        ...rule,
        subRules: [...(rule.subRules ?? []), nextRule],
      };
    }

    return {
      ...rule,
      subRules: appendSubRuleAtPath(rule.subRules ?? [], path.slice(1), nextRule),
    };
  });
}

function createEmptyRule(type: RuleType = "required_field"): WorkflowRule {
  if (type === "conditional") {
    return {
      id: createEditorId("rule"),
      type,
      onPass: "",
      onFail: "",
      subRules: [createEmptyRule("equals")],
    };
  }

  return {
    id: createEditorId("rule"),
    type,
    field: "",
    ...(type === "greater_than" || type === "equals" ? { value: "" } : {}),
  };
}

function createEmptyFieldDefinition(): InputFieldDefinition {
  return {
    type: "string",
    required: true,
    description: "",
  };
}

function createEmptyTransition(from = "", to = ""): WorkflowTransition {
  return {
    from,
    to,
    condition: "on_success",
  };
}

function createEmptyAction(stage = ""): WorkflowStageActionEditor {
  return {
    stage,
    id: createEditorId("action"),
    type: "fetch_external_score",
    targetField: "external_score",
    processedFlagField: "",
    historyMessage: "Fetched external score",
  };
}

function normalizeFieldForType(
  field: InputFieldDefinition,
  nextType: InputFieldType
): InputFieldDefinition {
  const baseField: InputFieldDefinition = {
    ...field,
    type: nextType,
  };

  if (nextType !== "number") {
    delete baseField.integer;
    delete baseField.min;
    delete baseField.max;
  }

  if (nextType !== "string") {
    delete baseField.minLength;
    delete baseField.maxLength;
    delete baseField.pattern;
  }

  return baseField;
}

function normalizeRuleForType(rule: WorkflowRule, nextType: RuleType): WorkflowRule {
  if (nextType === "conditional") {
    return {
      id: rule.id,
      type: nextType,
      onPass: rule.onPass ?? "",
      onFail: rule.onFail ?? "",
      subRules: rule.subRules && rule.subRules.length > 0 ? rule.subRules : [createEmptyRule("equals")],
    };
  }

  return {
    id: rule.id,
    type: nextType,
    field: rule.field ?? "",
    ...(nextType === "greater_than" || nextType === "equals"
      ? {
          value: rule.value ?? "",
        }
      : {}),
  };
}

function parseOptionalNumber(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return undefined;
  }

  const numericValue = Number(trimmed);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function parseEnumValues(
  rawValue: string,
  fieldType: InputFieldType
): Array<string | number | boolean> | undefined {
  const values = rawValue
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length === 0) {
    return undefined;
  }

  return values.map((value) => {
    if (fieldType === "number") {
      const numericValue = Number(value);
      return Number.isFinite(numericValue) ? numericValue : value;
    }

    if (fieldType === "boolean") {
      if (value.toLowerCase() === "true") {
        return true;
      }

      if (value.toLowerCase() === "false") {
        return false;
      }
    }

    return value;
  });
}

function inferRuleValue(
  rawValue: string,
  fieldConfig: InputFieldDefinition | undefined,
  ruleType: RuleType
) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return undefined;
  }

  if (fieldConfig?.type === "number" || ruleType === "greater_than") {
    const numericValue = Number(trimmed);
    return Number.isFinite(numericValue) ? numericValue : rawValue;
  }

  if (fieldConfig?.type === "boolean") {
    if (trimmed === "true") {
      return true;
    }

    if (trimmed === "false") {
      return false;
    }
  }

  return rawValue;
}

function createStarterWorkflowDraft(): WorkflowComposerDraft {
  return {
    name: starterWorkflowConfig.name,
    activate: true,
    allowUnknown: starterWorkflowConfig.inputSchema.allowUnknown,
    stagesText: starterWorkflowConfig.stages.join("\n"),
    inputFieldsText: stringifyJson(starterWorkflowConfig.inputSchema.fields),
    stageActionsText: stringifyJson(starterWorkflowConfig.stageActions),
    rulesText: stringifyJson(starterWorkflowConfig.rules),
    transitionsText: stringifyJson(starterWorkflowConfig.transitions),
  };
}

function createBlankWorkflowDraft(): WorkflowComposerDraft {
  return {
    name: "",
    activate: true,
    allowUnknown: false,
    stagesText: "intake\ndecision",
    inputFieldsText: stringifyJson({}),
    stageActionsText: stringifyJson({}),
    rulesText: stringifyJson({
      intake: [],
      decision: [],
    }),
    transitionsText: stringifyJson([
      {
        from: "intake",
        to: "decision",
        condition: "on_success",
      },
    ]),
  };
}

function createWorkflowDraftFromDetail(detail: WorkflowConfigDetail): WorkflowComposerDraft {
  return {
    name: detail.name,
    activate: true,
    allowUnknown: detail.inputSchema?.allowUnknown ?? false,
    stagesText: detail.stages.join("\n"),
    inputFieldsText: stringifyJson(detail.inputSchema?.fields ?? {}),
    stageActionsText: stringifyJson(detail.stageActions ?? {}),
    rulesText: stringifyJson(detail.rules),
    transitionsText: stringifyJson(detail.transitions),
  };
}

function createRequestDraft(): RequestConsoleDraft {
  return {
    workflowName: starterWorkflowConfig.name,
    workflowVersion: undefined,
    idempotencyKey: createIdempotencyKey(),
    inputDataText: stringifyJson({
      amount: 5000,
      credit_score: 740,
      external_verification: "passed",
    }),
    requestIdLookup: "",
    inputMode: "guided",
  };
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();

  if (!raw) {
    return {} as T;
  }

  return JSON.parse(raw) as T;
}

function describeApiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const error = "error" in payload && typeof payload.error === "string" ? payload.error : fallback;
  const details = "details" in payload ? payload.details : undefined;

  if (typeof details === "string" && details.trim()) {
    return `${error}: ${details}`;
  }

  return error;
}

async function fetchWorkflowConfigDetail(name: string, version: number) {
  const query = new URLSearchParams({
    name,
    version: String(version),
  });

  const response = await fetch(`/api/workflow-config?${query.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  const payload = await readJsonResponse<{ item?: WorkflowConfigDetail; error?: string }>(response);

  if (!response.ok || !payload.item) {
    throw new Error(describeApiError(payload, "Unable to load workflow details."));
  }

  return payload.item;
}

function buildWorkflowRequestBody(draft: WorkflowComposerDraft) {
  const name = draft.name.trim();
  if (!name) {
    throw new Error("Workflow name is required.");
  }

  const stages = draft.stagesText
    .split("\n")
    .map((stage) => stage.trim())
    .filter(Boolean);

  if (stages.length === 0) {
    throw new Error("Add at least one stage.");
  }

  const inputFields = parseJsonBlock<Record<string, InputFieldDefinition>>(
    draft.inputFieldsText,
    "Input fields",
    {}
  );
  const stageActions = parseJsonBlock<Record<string, WorkflowStageAction[]>>(
    draft.stageActionsText,
    "Stage actions",
    {}
  );
  const rules = parseJsonBlock<Record<string, WorkflowRule[]>>(draft.rulesText, "Rules", {});
  const transitions = parseJsonBlock<WorkflowTransition[]>(
    draft.transitionsText,
    "Transitions",
    []
  );

  const config: Record<string, unknown> = {
    name,
    stages,
    rules,
    transitions,
  };

  if (Object.keys(inputFields).length > 0) {
    config.inputSchema = {
      allowUnknown: draft.allowUnknown,
      fields: inputFields,
    };
  }

  if (Object.keys(stageActions).length > 0) {
    config.stageActions = stageActions;
  }

  return {
    config,
    activate: draft.activate,
  };
}

function resolveRequestWorkflowTarget(
  catalog: WorkflowConfigSummary[],
  workflowName: string,
  workflowVersion?: number
): WorkflowConfigSummary | null {
  if (workflowVersion !== undefined) {
    return (
      catalog.find((item) => item.name === workflowName && item.version === workflowVersion) ?? null
    );
  }

  const matches = catalog
    .filter((item) => item.name === workflowName)
    .sort((left, right) => {
      if (left.isActive !== right.isActive) {
        return left.isActive ? -1 : 1;
      }

      return right.version - left.version;
    });

  return matches[0] ?? null;
}

export default function WorkflowConsole() {
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("overview");
  const [catalog, setCatalog] = useState<WorkflowConfigSummary[]>([]);
  const [selectedWorkflowKey, setSelectedWorkflowKey] = useState("");
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowConfigDetail | null>(null);
  const [requestWorkflow, setRequestWorkflow] = useState<WorkflowConfigDetail | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [requestWorkflowLoading, setRequestWorkflowLoading] = useState(false);
  const [savingWorkflow, setSavingWorkflow] = useState(false);
  const [seedingRegistry, setSeedingRegistry] = useState(false);
  const [activatingKey, setActivatingKey] = useState<string | null>(null);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [loadingRequest, setLoadingRequest] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [composerDraft, setComposerDraft] = useState<WorkflowComposerDraft>(
    createStarterWorkflowDraft
  );
  const [composerPreview, setComposerPreview] = useState("");
  const [composerPreviewError, setComposerPreviewError] = useState<string | null>(null);
  const [requestDraft, setRequestDraft] = useState<RequestConsoleDraft>(createRequestDraft);
  const [requestSummary, setRequestSummary] = useState<RequestSummaryResponse | null>(null);
  const [requestDetails, setRequestDetails] = useState<RequestDetails | null>(null);

  const composerSections = readComposerSections(composerDraft);
  const flattenedActions = flattenStageActions(composerSections.stageActions);
  const builderFieldNames = Object.keys(composerSections.inputFields);
  const builderRuleCount = composerSections.stages.reduce((sum, stage) => {
    return sum + countNestedRules(composerSections.rules[stage] ?? []);
  }, 0);
  const ruleFieldOptions = Array.from(
    new Set(
      [...builderFieldNames, ...flattenedActions.map((action) => action.targetField.trim())].filter(
        Boolean
      )
    )
  );
  const requestTarget = resolveRequestWorkflowTarget(
    catalog,
    requestDraft.workflowName.trim(),
    requestDraft.workflowVersion
  );
  const requestTargetKey = requestTarget
    ? createWorkflowKey(requestTarget.name, requestTarget.version)
    : "";
  const requestWorkflowKey = requestWorkflow
    ? createWorkflowKey(requestWorkflow.name, requestWorkflow.version)
    : "";
  const requestInputResult = safeParseJsonBlock<unknown>(
    requestDraft.inputDataText,
    {},
    "Request input"
  );
  const requestInputObject = isObjectRecord(requestInputResult.value)
    ? (requestInputResult.value as Record<string, unknown>)
    : {};
  const requestSchemaFields = requestWorkflow?.inputSchema?.fields ?? {};
  const requestFieldEntries = Object.entries(requestSchemaFields);
  const canUseGuidedRequestForm = requestFieldEntries.length > 0;

  useEffect(() => {
    void loadCatalog();
  }, []);

  useEffect(() => {
    if (!selectedWorkflowKey) {
      setSelectedWorkflow(null);
      return;
    }

    const [name, versionText] = selectedWorkflowKey.split("::");
    const version = Number(versionText);
    if (!name || !Number.isInteger(version)) {
      return;
    }

    void loadWorkflowDetail(name, version);
  }, [selectedWorkflowKey]);

  useEffect(() => {
    try {
      const payload = buildWorkflowRequestBody(composerDraft);
      setComposerPreview(stringifyJson(payload.config));
      setComposerPreviewError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Preview unavailable.";
      setComposerPreview("");
      setComposerPreviewError(message);
    }
  }, [composerDraft]);

  useEffect(() => {
    if (requestDraft.inputMode === "guided" && !canUseGuidedRequestForm) {
      setRequestDraft((current) => ({
        ...current,
        inputMode: "json",
      }));
    }
  }, [canUseGuidedRequestForm, requestDraft.inputMode]);

  useEffect(() => {
    if (!requestTarget) {
      setRequestWorkflow(null);
      return;
    }

    if (
      selectedWorkflow &&
      createWorkflowKey(selectedWorkflow.name, selectedWorkflow.version) === requestTargetKey
    ) {
      setRequestWorkflow(selectedWorkflow);
      return;
    }

    if (requestWorkflowKey === requestTargetKey) {
      return;
    }

    let cancelled = false;
    setRequestWorkflowLoading(true);

    void fetchWorkflowConfigDetail(requestTarget.name, requestTarget.version)
      .then((item) => {
        if (!cancelled) {
          setRequestWorkflow(item);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRequestWorkflow(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRequestWorkflowLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    requestTarget,
    requestTargetKey,
    requestWorkflowKey,
    selectedWorkflow,
  ]);

  function setComposerSections(
    updater: (currentSections: ComposerSections) => Omit<ComposerSections, "errors">
  ) {
    setComposerDraft((currentDraft) => {
      const nextSections = updater(readComposerSections(currentDraft));
      return writeComposerDraft(currentDraft, nextSections);
    });
  }

  async function loadCatalog(preferredKey?: string) {
    setCatalogLoading(true);

    try {
      const response = await fetch("/api/workflow-config", {
        method: "GET",
        cache: "no-store",
      });
      const payload = await readJsonResponse<{ items?: WorkflowConfigSummary[]; error?: string }>(
        response
      );

      if (!response.ok) {
        throw new Error(describeApiError(payload, "Unable to load workflow catalog."));
      }

      const items = payload.items ?? [];
      setCatalog(items);
      setSelectedWorkflowKey((currentKey) => {
        const targetKey = preferredKey ?? currentKey;

        if (
          targetKey &&
          items.some((item) => createWorkflowKey(item.name, item.version) === targetKey)
        ) {
          return targetKey;
        }

        const activeItem = items.find((item) => item.isActive);
        if (activeItem) {
          return createWorkflowKey(activeItem.name, activeItem.version);
        }

        const firstItem = items[0];
        return firstItem ? createWorkflowKey(firstItem.name, firstItem.version) : "";
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load workflow catalog.";
      setNotice({ tone: "error", message });
    } finally {
      setCatalogLoading(false);
    }
  }

  async function loadWorkflowDetail(name: string, version: number) {
    setDetailLoading(true);

    try {
      const detail = await fetchWorkflowConfigDetail(name, version);
      setSelectedWorkflow(detail);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load workflow details.";
      setSelectedWorkflow(null);
      setNotice({ tone: "error", message });
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleSeedRegistry() {
    setSeedingRegistry(true);

    try {
      const response = await fetch("/api/workflow-config/seed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ activate: true }),
      });
      const payload = await readJsonResponse<{
        items?: Array<{ name: string; version: number; action: string }>;
        error?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(describeApiError(payload, "Unable to seed registry workflows."));
      }

      const seededCount = payload.items?.length ?? 0;
      setNotice({
        tone: "success",
        message:
          seededCount > 0
            ? `Seeded or updated ${seededCount} workflow version${seededCount === 1 ? "" : "s"}.`
            : "No registry workflows were available to seed.",
      });
      await loadCatalog();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to seed registry workflows.";
      setNotice({ tone: "error", message });
    } finally {
      setSeedingRegistry(false);
    }
  }

  async function handleActivateWorkflow(name: string, version: number) {
    const workflowKey = createWorkflowKey(name, version);
    setActivatingKey(workflowKey);

    try {
      const response = await fetch(`/api/workflow-config/${encodeURIComponent(name)}/activate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ version }),
      });
      const payload = await readJsonResponse<{ item?: WorkflowConfigDetail; error?: string }>(
        response
      );

      if (!response.ok) {
        throw new Error(describeApiError(payload, "Unable to activate workflow version."));
      }

      setNotice({
        tone: "success",
        message: `Activated ${name} v${version}.`,
      });
      await loadCatalog(workflowKey);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to activate workflow version.";
      setNotice({ tone: "error", message });
    } finally {
      setActivatingKey(null);
    }
  }

  async function handleSaveWorkflow(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingWorkflow(true);

    try {
      const body = buildWorkflowRequestBody(composerDraft);
      const response = await fetch("/api/workflow-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = await readJsonResponse<{
        item?: WorkflowConfigDetail;
        error?: string;
      }>(response);

      if (!response.ok || !payload.item) {
        throw new Error(describeApiError(payload, "Unable to save workflow configuration."));
      }

      const createdKey = createWorkflowKey(payload.item.name, payload.item.version);
      setNotice({
        tone: "success",
        message: `Created ${payload.item.name} v${payload.item.version}.`,
      });
      setSelectedWorkflowKey(createdKey);
      await loadCatalog(createdKey);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save workflow configuration.";
      setNotice({ tone: "error", message });
    } finally {
      setSavingWorkflow(false);
    }
  }

  async function loadRequestDetails(requestId: string) {
    setLoadingRequest(true);

    try {
      const response = await fetch(`/api/request/${encodeURIComponent(requestId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = await readJsonResponse<RequestDetails & { error?: string }>(response);

      if (!response.ok) {
        throw new Error(describeApiError(payload, "Unable to load request details."));
      }

      setRequestDetails(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load request details.";
      setRequestDetails(null);
      setNotice({ tone: "error", message });
    } finally {
      setLoadingRequest(false);
    }
  }

  async function handleSubmitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingRequest(true);

    try {
      const workflowName = requestDraft.workflowName.trim();
      const workflowVersion = requestDraft.workflowVersion;
      const idempotencyKey = requestDraft.idempotencyKey.trim();

      if (!workflowName) {
        throw new Error("Workflow name is required before sending a request.");
      }

      if (!idempotencyKey) {
        throw new Error("Idempotency key is required before sending a request.");
      }

      const inputData = parseJsonBlock<Record<string, unknown>>(
        requestDraft.inputDataText,
        "Request input",
        {}
      );

      const response = await fetch("/api/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workflowName,
          workflowVersion,
          idempotencyKey,
          inputData,
        }),
      });

      const payload = await readJsonResponse<RequestSummaryResponse & { error?: string }>(response);

      if (!response.ok && !payload.requestId) {
        throw new Error(describeApiError(payload, "Unable to submit workflow request."));
      }

      setRequestSummary(payload);
      if (payload.requestId) {
        setRequestDraft((current) => ({
          ...current,
          requestIdLookup: payload.requestId,
        }));
        await loadRequestDetails(payload.requestId);
      }

      setNotice({
        tone: "success",
        message:
          payload.status === "processing"
            ? `Request ${payload.requestId} accepted and is still processing.`
            : `Request ${payload.requestId} finished with status ${payload.status}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit workflow request.";
      setNotice({ tone: "error", message });
    } finally {
      setSubmittingRequest(false);
    }
  }

  async function handleLookupRequest(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    const requestId = requestDraft.requestIdLookup.trim();
    if (!requestId) {
      setNotice({
        tone: "info",
        message: "Enter a request ID to inspect a previous run.",
      });
      return;
    }

    await loadRequestDetails(requestId);
  }

  function moveStage(index: number, direction: -1 | 1) {
    setComposerSections((currentSections) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= currentSections.stages.length) {
        return currentSections;
      }

      const stages = [...currentSections.stages];
      const [stage] = stages.splice(index, 1);
      stages.splice(nextIndex, 0, stage);

      return {
        stages,
        inputFields: currentSections.inputFields,
        stageActions: currentSections.stageActions,
        rules: currentSections.rules,
        transitions: currentSections.transitions,
      };
    });
  }

  function addStage() {
    setComposerSections((currentSections) => {
      const nextStageName = `stage_${currentSections.stages.length + 1}`;
      return {
        stages: [...currentSections.stages, nextStageName],
        inputFields: currentSections.inputFields,
        stageActions: currentSections.stageActions,
        rules: {
          ...currentSections.rules,
          [nextStageName]: [],
        },
        transitions: currentSections.transitions,
      };
    });
  }

  function updateStageName(index: number, nextName: string) {
    const previousStage = composerSections.stages[index];
    const normalizedStageName = nextName.trim();

    if (!previousStage || !normalizedStageName || normalizedStageName === previousStage) {
      return;
    }

    if (composerSections.stages.some((stage) => stage === normalizedStageName)) {
      setNotice({
        tone: "error",
        message: `Stage name "${normalizedStageName}" already exists.`,
      });
      return;
    }

    setComposerSections((currentSections) => {
      const currentStage = currentSections.stages[index];
      const stages = currentSections.stages.map((stage, stageIndex) =>
        stageIndex === index ? normalizedStageName : stage
      );
      const renamedRules = Object.fromEntries(
        Object.entries(
          renameObjectKey(currentSections.rules, currentStage, normalizedStageName)
        ).map(
          ([stageName, stageRules]) => [
            stageName,
            renameRuleStageTargets(stageRules, currentStage, normalizedStageName),
          ]
        )
      );

      return {
        stages,
        inputFields: currentSections.inputFields,
        stageActions: renameObjectKey(
          currentSections.stageActions,
          currentStage,
          normalizedStageName
        ),
        rules: renamedRules,
        transitions: currentSections.transitions.map((transition) => ({
          ...transition,
          from: transition.from === currentStage ? normalizedStageName : transition.from,
          to: transition.to === currentStage ? normalizedStageName : transition.to,
        })),
      };
    });
  }

  function removeStage(index: number) {
    setComposerSections((currentSections) => {
      const stageToRemove = currentSections.stages[index];
      const stages = currentSections.stages.filter((_, stageIndex) => stageIndex !== index);
      const rules = Object.fromEntries(
        Object.entries(currentSections.rules)
          .filter(([stageName]) => stageName !== stageToRemove)
          .map(([stageName, stageRules]) => [stageName, clearRuleStageTargets(stageRules, stageToRemove)])
      );
      const stageActions = Object.fromEntries(
        Object.entries(currentSections.stageActions).filter(([stageName]) => stageName !== stageToRemove)
      );

      return {
        stages,
        inputFields: currentSections.inputFields,
        stageActions,
        rules,
        transitions: currentSections.transitions.filter(
          (transition) => transition.from !== stageToRemove && transition.to !== stageToRemove
        ),
      };
    });
  }

  function autofillTransitions() {
    setComposerSections((currentSections) => ({
      stages: currentSections.stages,
      inputFields: currentSections.inputFields,
      stageActions: currentSections.stageActions,
      rules: currentSections.rules,
      transitions: currentSections.stages.slice(0, -1).map((stage, stageIndex) =>
        createEmptyTransition(stage, currentSections.stages[stageIndex + 1])
      ),
    }));
  }

  function addInputField() {
    setComposerSections((currentSections) => ({
      stages: currentSections.stages,
      inputFields: {
        ...currentSections.inputFields,
        [`field_${Object.keys(currentSections.inputFields).length + 1}`]: createEmptyFieldDefinition(),
      },
      stageActions: currentSections.stageActions,
      rules: currentSections.rules,
      transitions: currentSections.transitions,
    }));
  }

  function renameInputField(previousFieldName: string, nextFieldName: string) {
    const normalizedFieldName = nextFieldName.trim();

    if (!normalizedFieldName || normalizedFieldName === previousFieldName) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(composerSections.inputFields, normalizedFieldName)) {
      setNotice({
        tone: "error",
        message: `Field name "${normalizedFieldName}" already exists.`,
      });
      return;
    }

    setComposerSections((currentSections) => ({
      stages: currentSections.stages,
      inputFields: renameObjectKey(
        currentSections.inputFields,
        previousFieldName,
        normalizedFieldName
      ),
      stageActions: currentSections.stageActions,
      rules: Object.fromEntries(
        Object.entries(currentSections.rules).map(([stageName, stageRules]) => [
          stageName,
          renameRuleFieldReferences(stageRules, previousFieldName, normalizedFieldName),
        ])
      ),
      transitions: currentSections.transitions,
    }));
  }

  function updateInputField(
    fieldName: string,
    updater: (field: InputFieldDefinition) => InputFieldDefinition
  ) {
    setComposerSections((currentSections) => ({
      stages: currentSections.stages,
      inputFields: {
        ...currentSections.inputFields,
        [fieldName]: updater(currentSections.inputFields[fieldName] ?? createEmptyFieldDefinition()),
      },
      stageActions: currentSections.stageActions,
      rules: currentSections.rules,
      transitions: currentSections.transitions,
    }));
  }

  function removeInputField(fieldName: string) {
    setComposerSections((currentSections) => {
      const nextFields = { ...currentSections.inputFields };
      delete nextFields[fieldName];

      return {
        stages: currentSections.stages,
        inputFields: nextFields,
        stageActions: currentSections.stageActions,
        rules: currentSections.rules,
        transitions: currentSections.transitions,
      };
    });
  }

  function updateStageActions(
    updater: (actions: WorkflowStageActionEditor[]) => WorkflowStageActionEditor[]
  ) {
    setComposerSections((currentSections) => ({
      stages: currentSections.stages,
      inputFields: currentSections.inputFields,
      stageActions: groupStageActions(updater(flattenStageActions(currentSections.stageActions))),
      rules: currentSections.rules,
      transitions: currentSections.transitions,
    }));
  }

  function updateStageRules(
    stageName: string,
    updater: (rules: WorkflowRule[]) => WorkflowRule[]
  ) {
    setComposerSections((currentSections) => ({
      stages: currentSections.stages,
      inputFields: currentSections.inputFields,
      stageActions: currentSections.stageActions,
      rules: {
        ...currentSections.rules,
        [stageName]: updater(currentSections.rules[stageName] ?? []),
      },
      transitions: currentSections.transitions,
    }));
  }

  function updateTransition(index: number, updater: (transition: WorkflowTransition) => WorkflowTransition) {
    setComposerSections((currentSections) => ({
      stages: currentSections.stages,
      inputFields: currentSections.inputFields,
      stageActions: currentSections.stageActions,
      rules: currentSections.rules,
      transitions: currentSections.transitions.map((transition, transitionIndex) =>
        transitionIndex === index ? updater(transition) : transition
      ),
    }));
  }

  function addTransition() {
    setComposerSections((currentSections) => {
      const from = currentSections.stages[0] ?? "";
      const to = currentSections.stages[1] ?? "";

      return {
        stages: currentSections.stages,
        inputFields: currentSections.inputFields,
        stageActions: currentSections.stageActions,
        rules: currentSections.rules,
        transitions: [...currentSections.transitions, createEmptyTransition(from, to)],
      };
    });
  }

  function removeTransition(index: number) {
    setComposerSections((currentSections) => ({
      stages: currentSections.stages,
      inputFields: currentSections.inputFields,
      stageActions: currentSections.stageActions,
      rules: currentSections.rules,
      transitions: currentSections.transitions.filter(
        (_, transitionIndex) => transitionIndex !== index
      ),
    }));
  }

  function updateRequestInputField(fieldName: string, rawValue: string, field: InputFieldDefinition) {
    const nextInputData = {
      ...(requestInputResult.error ? {} : requestInputObject),
    };

    if (field.type === "boolean") {
      if (!rawValue) {
        delete nextInputData[fieldName];
      } else {
        nextInputData[fieldName] = rawValue === "true";
      }
    } else if (field.type === "number") {
      if (!rawValue.trim()) {
        delete nextInputData[fieldName];
      } else {
        const numericValue = Number(rawValue);
        nextInputData[fieldName] = Number.isFinite(numericValue) ? numericValue : rawValue;
      }
    } else if (!rawValue.trim()) {
      delete nextInputData[fieldName];
    } else {
      nextInputData[fieldName] = rawValue;
    }

    setRequestDraft((current) => ({
      ...current,
      inputDataText: stringifyJson(nextInputData),
    }));
  }

  function renderRuleEditor(
    stageName: string,
    rule: WorkflowRule,
    path: number[],
    depth = 0
  ): React.ReactNode {
    const fieldConfig =
      rule.field && composerSections.inputFields[rule.field]
        ? composerSections.inputFields[rule.field]
        : undefined;
    const branchTargets = [...composerSections.stages, ...statusTargets];

    return (
      <div
        key={`${stageName}-${path.join("-")}`}
        className={`${styles.ruleEditor} ${depth > 0 ? styles.ruleEditorNested : ""}`}
      >
        <div className={styles.ruleMeta}>
          <span className={styles.ruleNumber}>
            {depth > 0 ? `Condition ${path.join(".")}` : `Rule ${path.join(".")}`}
          </span>
          <button
            type="button"
            className={styles.dangerButton}
            onClick={() => updateStageRules(stageName, (rules) => removeRuleAtPath(rules, path))}
          >
            Remove
          </button>
        </div>

        <div className={styles.builderGrid}>
          <div className={styles.formRow}>
            <label className={styles.label}>Rule ID</label>
            <input
              className={styles.input}
              value={rule.id}
              onChange={(event) =>
                updateStageRules(stageName, (rules) =>
                  updateRuleAtPath(rules, path, (currentRule) => ({
                    ...currentRule,
                    id: event.target.value,
                  }))
                )
              }
            />
          </div>

          <div className={styles.formRow}>
            <label className={styles.label}>Rule type</label>
            <select
              className={styles.select}
              value={rule.type}
              onChange={(event) =>
                updateStageRules(stageName, (rules) =>
                  updateRuleAtPath(rules, path, (currentRule) =>
                    normalizeRuleForType(currentRule, event.target.value as RuleType)
                  )
                )
              }
            >
              <option value="required_field">Required field</option>
              <option value="greater_than">Greater than</option>
              <option value="equals">Equals</option>
              <option value="conditional">Conditional branch</option>
            </select>
          </div>
        </div>

        {rule.type === "conditional" ? (
          <div className={styles.subRuleBlock}>
            <div className={styles.builderGrid}>
              <div className={styles.formRow}>
                <label className={styles.label}>On pass</label>
                <select
                  className={styles.select}
                  value={rule.onPass ?? ""}
                  onChange={(event) =>
                    updateStageRules(stageName, (rules) =>
                      updateRuleAtPath(rules, path, (currentRule) => ({
                        ...currentRule,
                        onPass: event.target.value,
                      }))
                    )
                  }
                >
                  <option value="">Keep using transitions</option>
                  {branchTargets.map((target) => (
                    <option key={`${rule.id}-pass-${target}`} value={target}>
                      {target}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formRow}>
                <label className={styles.label}>On fail</label>
                <select
                  className={styles.select}
                  value={rule.onFail ?? ""}
                  onChange={(event) =>
                    updateStageRules(stageName, (rules) =>
                      updateRuleAtPath(rules, path, (currentRule) => ({
                        ...currentRule,
                        onFail: event.target.value,
                      }))
                    )
                  }
                >
                  <option value="">Keep using transitions</option>
                  {branchTargets.map((target) => (
                    <option key={`${rule.id}-fail-${target}`} value={target}>
                      {target}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.sectionHeader}>
              <div>
                <h4 className={styles.sectionTitle}>Conditions</h4>
                <p className={styles.sectionIntro}>
                  Add one or more checks that determine the branch target.
                </p>
              </div>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() =>
                  updateStageRules(stageName, (rules) =>
                    appendSubRuleAtPath(rules, path, createEmptyRule("equals"))
                  )
                }
              >
                Add condition
              </button>
            </div>

            <div className={styles.subRuleList}>
              {(rule.subRules ?? []).map((subRule, subRuleIndex) =>
                renderRuleEditor(stageName, subRule, [...path, subRuleIndex], depth + 1)
              )}
            </div>
          </div>
        ) : (
          <div className={styles.builderGrid}>
            <div className={styles.formRow}>
              <label className={styles.label}>Field</label>
              <input
                className={styles.input}
                list="builder-field-options"
                value={rule.field ?? ""}
                onChange={(event) =>
                  updateStageRules(stageName, (rules) =>
                    updateRuleAtPath(rules, path, (currentRule) => ({
                      ...currentRule,
                      field: event.target.value,
                    }))
                  )
                }
                placeholder="amount"
              />
              <p className={styles.helperText}>Pick an input field or type a computed field name.</p>
            </div>

            {rule.type === "equals" || rule.type === "greater_than" ? (
              <div className={styles.formRow}>
                <label className={styles.label}>Expected value</label>
                {fieldConfig?.enum && fieldConfig.enum.length > 0 ? (
                  <select
                    className={styles.select}
                    value={valueToEditorString(rule.value)}
                    onChange={(event) =>
                      updateStageRules(stageName, (rules) =>
                        updateRuleAtPath(rules, path, (currentRule) => ({
                          ...currentRule,
                          value: inferRuleValue(
                            event.target.value,
                            fieldConfig,
                            currentRule.type
                          ),
                        }))
                      )
                    }
                  >
                    <option value="">Select a value</option>
                    {fieldConfig.enum.map((value) => {
                      const optionValue = String(value);
                      return (
                        <option key={`${rule.id}-value-${optionValue}`} value={optionValue}>
                          {optionValue}
                        </option>
                      );
                    })}
                  </select>
                ) : fieldConfig?.type === "boolean" ? (
                  <select
                    className={styles.select}
                    value={valueToEditorString(rule.value)}
                    onChange={(event) =>
                      updateStageRules(stageName, (rules) =>
                        updateRuleAtPath(rules, path, (currentRule) => ({
                          ...currentRule,
                          value: inferRuleValue(
                            event.target.value,
                            fieldConfig,
                            currentRule.type
                          ),
                        }))
                      )
                    }
                  >
                    <option value="">Select</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    className={styles.input}
                    type={fieldConfig?.type === "number" || rule.type === "greater_than" ? "number" : "text"}
                    value={valueToEditorString(rule.value)}
                    onChange={(event) =>
                      updateStageRules(stageName, (rules) =>
                        updateRuleAtPath(rules, path, (currentRule) => ({
                          ...currentRule,
                          value: inferRuleValue(
                            event.target.value,
                            fieldConfig,
                            currentRule.type
                          ),
                        }))
                      )
                    }
                    placeholder={rule.type === "greater_than" ? "600" : "passed"}
                  />
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  const totalVersions = catalog.length;
  const activeWorkflows = new Set(catalog.filter((item) => item.isActive).map((item) => item.name))
    .size;
  const totalRules = catalog.reduce((sum, item) => sum + item.ruleCount, 0);
  const totalActions = catalog.reduce((sum, item) => sum + item.stageActionCount, 0);
  const currentRuleCount = selectedWorkflow
    ? Object.values(selectedWorkflow.rules).reduce((sum, rules) => sum + countNestedRules(rules), 0)
    : 0;
  const builderHasName = composerDraft.name.trim().length > 0;
  const builderHasFlow = composerSections.stages.length > 1 && composerSections.transitions.length > 0;
  const builderHasInputs = builderFieldNames.length > 0;
  const builderHasRules = builderRuleCount > 0;
  const builderReadyToSave = builderHasName && builderHasFlow && builderHasRules && !composerPreviewError;
  const builderChecklist = [
    {
      title: "Name the workflow",
      detail: builderHasName
        ? `Saved as "${composerDraft.name.trim()}".`
        : "Use a stable name like loan_application so requests can target it later.",
      tone: builderHasName ? ("done" as const) : ("attention" as const),
    },
    {
      title: "Map the flow",
      detail: builderHasFlow
        ? `${composerSections.stages.length} stages and ${composerSections.transitions.length} transitions are connected.`
        : "Add stages first, then link them with transitions or Auto-connect stages.",
      tone: builderHasFlow ? ("done" as const) : ("attention" as const),
    },
    {
      title: "Describe the input",
      detail: builderHasInputs
        ? `${builderFieldNames.length} field(s) will power a guided request form.`
        : "Optional, but recommended if you want the request screen to become form-based.",
      tone: builderHasInputs ? ("done" as const) : ("tip" as const),
    },
    {
      title: "Add decision rules",
      detail: builderHasRules
        ? `${builderRuleCount} rule(s) will drive stage validation and branching.`
        : "Rules decide whether a request passes, fails, or branches to another stage/status.",
      tone: builderHasRules ? ("done" as const) : ("attention" as const),
    },
    {
      title: "Save the version",
      detail: builderReadyToSave
        ? "The payload compiles cleanly and is ready to save."
        : composerPreviewError ?? "Finish the key sections above before creating the version.",
      tone: builderReadyToSave ? ("done" as const) : ("attention" as const),
    },
  ];
  const builderQuickPath = [
    {
      title: "1. Pick a starting point",
      detail: "Use Starter flow if you want a working example, or Blank workflow if you want to build from scratch.",
    },
    {
      title: "2. Shape the workflow",
      detail: "Stages define the path, inputs define the request form, and rules define the decisions.",
    },
    {
      title: "3. Save and test",
      detail: "Create a new version, then switch to the request panel and submit a test run.",
    },
  ];
  const ruleGuide = [
    {
      title: "Required field",
      detail: "Checks that a field exists before the workflow continues.",
    },
    {
      title: "Equals",
      detail: "Compares a field to a specific value like passed, failed, true, or 10.",
    },
    {
      title: "Greater than",
      detail: "Useful for thresholds like score > 600 or amount > 0.",
    },
    {
      title: "Conditional branch",
      detail: "Runs one or more sub-rules, then jumps to another stage or terminal status.",
    },
  ];
  const requiredRequestFields = requestFieldEntries.filter(([, field]) => field.required !== false);
  const missingRequiredRequestFields = requiredRequestFields.filter(([fieldName]) => {
    const value = requestInputObject[fieldName];
    return value === undefined || value === "";
  });
  const requestHasWorkflow = requestDraft.workflowName.trim().length > 0;
  const requestHasIdempotencyKey = requestDraft.idempotencyKey.trim().length > 0;
  const requestPayloadValid = !requestInputResult.error;
  const requestReady =
    requestHasWorkflow &&
    requestHasIdempotencyKey &&
    requestPayloadValid &&
    missingRequiredRequestFields.length === 0;
  const requestChecklist = [
    {
      title: "Pick a workflow",
      detail: requestHasWorkflow
        ? requestDraft.workflowVersion
          ? `Requests will target "${requestDraft.workflowName.trim()}" v${requestDraft.workflowVersion}.`
          : `Requests will target "${requestDraft.workflowName.trim()}" using the active or latest version.`
        : "Choose the stored workflow you want to test.",
      tone: requestHasWorkflow ? ("done" as const) : ("attention" as const),
    },
    {
      title: "Schema found",
      detail: requestWorkflow
        ? `Using ${requestWorkflow.name} v${requestWorkflow.version}${requestDraft.workflowVersion ? " as a pinned version" : ""}${canUseGuidedRequestForm ? " with a guided form." : "."}`
        : "If a stored version exists, the request panel can explain the input for you.",
      tone: requestWorkflow ? ("done" as const) : ("tip" as const),
    },
    {
      title: "Payload is valid",
      detail: requestPayloadValid
        ? "The payload is valid JSON and ready to submit."
        : requestInputResult.error ?? "Fix the request input before sending it.",
      tone: requestPayloadValid ? ("done" as const) : ("attention" as const),
    },
    {
      title: "Required fields covered",
      detail:
        missingRequiredRequestFields.length === 0
          ? `All ${requiredRequestFields.length} required field(s) are filled.`
          : `Missing: ${missingRequiredRequestFields.map(([fieldName]) => fieldName).join(", ")}.`,
      tone: missingRequiredRequestFields.length === 0 ? ("done" as const) : ("attention" as const),
    },
    {
      title: "Ready to send",
      detail: requestReady
        ? "This request is ready to send to the workflow engine."
        : "Complete the missing items above, then send the request.",
      tone: requestReady ? ("done" as const) : ("attention" as const),
    },
  ];
  const requestGuide = [
    {
      title: "Guided form mode",
      detail: "Best when the workflow has an input schema. The UI will render fields, enums, and booleans for you.",
    },
    {
      title: "Raw JSON mode",
      detail: "Best for advanced testing or unknown fields. You still keep the payload preview in sync.",
    },
    {
      title: "Inspect after submit",
      detail: "Use the returned request ID to see decisions, triggered rules, current stage, and history.",
    },
  ];
  const handleSelectWorkflow = (workflowKey: string) => {
    setSelectedWorkflowKey(workflowKey);
    setWorkspaceView("overview");
  };

  const handleForkSelectedWorkflow = () => {
    if (!selectedWorkflow) {
      return;
    }

    setComposerDraft(createWorkflowDraftFromDetail(selectedWorkflow));
  };

  const handleOpenSelectedWorkflowInBuilder = () => {
    handleForkSelectedWorkflow();
    setWorkspaceView("builder");
  };

  const handleOpenSelectedWorkflowInRequests = () => {
    if (!selectedWorkflow) {
      return;
    }

    setRequestDraft((current) => ({
      ...current,
      workflowName: selectedWorkflow.name,
      workflowVersion: selectedWorkflow.version,
      inputDataText: buildRequestSample(selectedWorkflow),
      inputMode:
        Object.keys(selectedWorkflow.inputSchema?.fields ?? {}).length > 0 ? "guided" : "json",
    }));
    setWorkspaceView("requests");
  };

  const handleCreateStarterWorkflow = () => {
    setComposerDraft(createStarterWorkflowDraft());
  };

  const handleCreateBlankWorkflow = () => {
    setComposerDraft(createBlankWorkflowDraft());
  };

  const handleAddStageAction = () => {
    updateStageActions((actions) => [
      ...actions,
      createEmptyAction(composerSections.stages[0] ?? ""),
    ]);
  };

  const handleRemoveStageAction = (actionIndex: number) => {
    updateStageActions((actions) => actions.filter((_, index) => index !== actionIndex));
  };

  const handleAddRule = (stageName: string) => {
    updateStageRules(stageName, (rules) => [...rules, createEmptyRule("required_field")]);
  };

  const handleGenerateRequestKey = () => {
    setRequestDraft((current) => ({
      ...current,
      idempotencyKey: createIdempotencyKey(),
    }));
  };

  const handleFillRequestSample = () => {
    if (!requestWorkflow) {
      return;
    }

    setRequestDraft((current) => ({
      ...current,
      inputDataText: buildRequestSample(requestWorkflow),
      inputMode: canUseGuidedRequestForm ? "guided" : "json",
    }));
  };

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Workflow orchestration console</p>
            <h1 className={styles.title}>Build, activate, and test workflows from one calmer screen.</h1>
            <p className={styles.subtitle}>
              Use guided forms first, then open raw JSON only when you need it.
            </p>
          </div>

          <div className={styles.heroActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void loadCatalog(selectedWorkflowKey)}
              disabled={catalogLoading}
            >
              {catalogLoading ? "Refreshing..." : "Refresh catalog"}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void handleSeedRegistry()}
              disabled={seedingRegistry}
            >
              {seedingRegistry ? "Seeding..." : "Seed registry defaults"}
            </button>
          </div>
        </section>

        {notice ? (
          <div className={`${styles.notice} ${styles[`notice${notice.tone}`]}`}>{notice.message}</div>
        ) : null}

        <section className={styles.workspaceTabs}>
          <button
            type="button"
            className={`${styles.workspaceTab} ${
              workspaceView === "overview" ? styles.workspaceTabActive : ""
            }`}
            onClick={() => setWorkspaceView("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            className={`${styles.workspaceTab} ${
              workspaceView === "builder" ? styles.workspaceTabActive : ""
            }`}
            onClick={() => setWorkspaceView("builder")}
          >
            Builder
          </button>
          <button
            type="button"
            className={`${styles.workspaceTab} ${
              workspaceView === "requests" ? styles.workspaceTabActive : ""
            }`}
            onClick={() => setWorkspaceView("requests")}
          >
            Requests
          </button>
        </section>

        {workspaceView === "overview" ? (
          <div className={styles.introStack}>
            <section className={styles.summaryStrip}>
              <article className={styles.summaryChip}>
                <span className={styles.summaryLabel}>Stored versions</span>
                <strong className={styles.summaryValue}>{totalVersions}</strong>
              </article>
              <article className={styles.summaryChip}>
                <span className={styles.summaryLabel}>Active workflows</span>
                <strong className={styles.summaryValue}>{activeWorkflows}</strong>
              </article>
              <article className={styles.summaryChip}>
                <span className={styles.summaryLabel}>Rules in catalog</span>
                <strong className={styles.summaryValue}>{totalRules}</strong>
              </article>
              <article className={styles.summaryChip}>
                <span className={styles.summaryLabel}>Stage actions</span>
                <strong className={styles.summaryValue}>{totalActions}</strong>
              </article>
            </section>

            <details className={styles.helpPanel}>
              <summary className={styles.helpSummary}>
                <span>Page guide</span>
                <span className={styles.helpSummaryMeta}>Open only if you need the walkthrough</span>
              </summary>
              <div className={styles.helpBody}>
                <section className={styles.quickGuide}>
                  {builderQuickPath.map((step) => (
                    <article key={step.title} className={styles.quickGuideCard}>
                      <h3 className={styles.quickGuideTitle}>{step.title}</h3>
                      <p className={styles.quickGuideText}>{step.detail}</p>
                    </article>
                  ))}
                </section>
              </div>
            </details>
          </div>
        ) : null}

        <div className={styles.board}>
          <WorkflowConsoleSidebar
            activatingKey={activatingKey}
            catalog={catalog}
            catalogLoading={catalogLoading}
            currentRuleCount={currentRuleCount}
            detailLoading={detailLoading}
            selectedWorkflow={selectedWorkflow}
            selectedWorkflowKey={selectedWorkflowKey}
            onActivateWorkflow={(name, version) => {
              void handleActivateWorkflow(name, version);
            }}
            onOpenBuilder={handleOpenSelectedWorkflowInBuilder}
            onOpenOverview={() => setWorkspaceView("overview")}
            onOpenRequests={handleOpenSelectedWorkflowInRequests}
            onSelectWorkflow={handleSelectWorkflow}
          />

          <div className={styles.workspaceArea}>
            {workspaceView === "overview" ? (
              <WorkflowConsoleOverview
                detailLoading={detailLoading}
                selectedWorkflow={selectedWorkflow}
              />
            ) : null}

            {workspaceView === "builder" ? (
              <WorkflowConsoleBuilder
                builderChecklist={builderChecklist}
                builderFieldNames={builderFieldNames}
                builderRuleCount={builderRuleCount}
                composerDraft={composerDraft}
                composerPreview={composerPreview}
                composerPreviewError={composerPreviewError}
                composerSections={composerSections}
                flattenedActions={flattenedActions}
                renderRuleEditor={renderRuleEditor}
                ruleFieldOptions={ruleFieldOptions}
                ruleGuide={ruleGuide}
                savingWorkflow={savingWorkflow}
                selectedWorkflow={selectedWorkflow}
                onAddInputField={addInputField}
                onAddRule={handleAddRule}
                onAddStage={addStage}
                onAddStageAction={handleAddStageAction}
                onAddTransition={addTransition}
                onAutofillTransitions={autofillTransitions}
                onCreateBlankWorkflow={handleCreateBlankWorkflow}
                onCreateStarterWorkflow={handleCreateStarterWorkflow}
                onForkSelectedWorkflow={handleForkSelectedWorkflow}
                onMoveStage={moveStage}
                onNormalizeFieldForType={normalizeFieldForType}
                onParseEnumValues={parseEnumValues}
                onParseOptionalNumber={parseOptionalNumber}
                onRemoveInputField={removeInputField}
                onRemoveStage={removeStage}
                onRemoveStageAction={handleRemoveStageAction}
                onRemoveTransition={removeTransition}
                onRenameInputField={renameInputField}
                onSaveWorkflow={handleSaveWorkflow}
                onSetComposerDraft={setComposerDraft}
                onUpdateInputField={updateInputField}
                onUpdateStageActions={updateStageActions}
                onUpdateStageName={updateStageName}
                onUpdateTransition={updateTransition}
              />
            ) : null}

            {workspaceView === "requests" ? (
              <WorkflowConsoleRequestRunner
                canUseGuidedRequestForm={canUseGuidedRequestForm}
                loadingRequest={loadingRequest}
                requestChecklist={requestChecklist}
                requestDetails={requestDetails}
                requestDraft={requestDraft}
                requestFieldEntries={requestFieldEntries}
                requestGuide={requestGuide}
                requestInputObject={requestInputObject}
                requestInputResult={requestInputResult}
                requestReady={requestReady}
                requestSummary={requestSummary}
                requestWorkflow={requestWorkflow}
                requestWorkflowLoading={requestWorkflowLoading}
                requiredRequestFields={requiredRequestFields}
                submittingRequest={submittingRequest}
                workflowCatalog={catalog}
                onFillSampleValues={handleFillRequestSample}
                onGenerateKey={handleGenerateRequestKey}
                onLookupRequest={(event) => void handleLookupRequest(event)}
                onSetRequestDraft={setRequestDraft}
                onSubmitRequest={handleSubmitRequest}
                onUpdateRequestInputField={updateRequestInputField}
              />
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
