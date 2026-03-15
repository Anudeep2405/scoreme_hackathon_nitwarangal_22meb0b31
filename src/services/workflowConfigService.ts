import { z } from "zod";
import {
  workflowRegistry,
  InputFieldSchema,
  StageAction,
  WorkflowConfig,
  WorkflowInputSchema,
} from "@/config/workflows";
import logger from "@/lib/logger";
import dbConnect from "@/lib/mongodb";
import { WorkflowConfigModel } from "@/models/WorkflowConfig";

export type WorkflowConfigSource = "database" | "registry";

export interface ResolvedWorkflowConfig {
  config: WorkflowConfig;
  source: WorkflowConfigSource;
  version: number;
}

export interface WorkflowConfigLookupOptions {
  source?: WorkflowConfigSource;
  version?: number;
}

export interface StoredWorkflowConfigRecord {
  name: string;
  version: number;
  isActive: boolean;
  inputSchema?: WorkflowInputSchema;
  stageActions?: Record<string, StageAction[]>;
  stages: string[];
  rules: WorkflowConfig["rules"];
  transitions: WorkflowConfig["transitions"];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WorkflowConfigSummary {
  name: string;
  version: number;
  isActive: boolean;
  inputFieldCount: number;
  stageActionCount: number;
  stageCount: number;
  ruleCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WorkflowSeedResult {
  name: string;
  version: number;
  isActive: boolean;
  action: "created" | "skipped" | "activated";
}

const ruleSchema: z.ZodTypeAny = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      type: z.enum(["required_field", "greater_than", "equals", "conditional"]),
      field: z.string().min(1).optional(),
      value: z.unknown().optional(),
      onPass: z.string().min(1).optional(),
      onFail: z.string().min(1).optional(),
      subRules: z.array(ruleSchema).optional(),
    })
    .superRefine((rule, ctx) => {
      if (rule.type === "conditional") {
        if (!rule.subRules || rule.subRules.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Conditional rules must define at least one sub-rule",
            path: ["subRules"],
          });
        }
        return;
      }

      if (!rule.field) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${rule.type} rules must define a field`,
          path: ["field"],
        });
      }

      if ((rule.type === "greater_than" || rule.type === "equals") && rule.value === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${rule.type} rules must define a comparison value`,
          path: ["value"],
        });
      }
    })
);

const transitionSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  condition: z.enum(["always", "on_success", "on_failure"]).optional(),
});

const stageActionSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1),
    type: z.literal("fetch_external_score"),
    targetField: z.string().min(1),
    processedFlagField: z.string().min(1).optional(),
    historyMessage: z.string().min(1).optional(),
  }),
]);

const inputFieldDefinitionSchema = z
  .object({
    type: z.enum(["string", "number", "boolean"]),
    required: z.boolean().default(true),
    integer: z.boolean().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    minLength: z.number().int().min(0).optional(),
    maxLength: z.number().int().min(0).optional(),
    pattern: z.string().optional(),
    enum: z.array(z.union([z.string(), z.number(), z.boolean()])).min(1).optional(),
    description: z.string().optional(),
  })
  .superRefine((field, ctx) => {
    if (field.type !== "number") {
      if (field.integer !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Only number fields can declare 'integer'",
          path: ["integer"],
        });
      }

      if (field.min !== undefined || field.max !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Only number fields can declare 'min'/'max'",
          path: ["min"],
        });
      }
    }

    if (field.type !== "string") {
      if (field.minLength !== undefined || field.maxLength !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Only string fields can declare 'minLength'/'maxLength'",
          path: ["minLength"],
        });
      }

      if (field.pattern !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Only string fields can declare 'pattern'",
          path: ["pattern"],
        });
      }
    }

    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "'min' cannot be greater than 'max'",
        path: ["min"],
      });
    }

    if (
      field.minLength !== undefined &&
      field.maxLength !== undefined &&
      field.minLength > field.maxLength
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "'minLength' cannot be greater than 'maxLength'",
        path: ["minLength"],
      });
    }

    if (field.pattern) {
      try {
        new RegExp(field.pattern);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid regular expression in 'pattern'",
          path: ["pattern"],
        });
      }
    }

    if (field.enum) {
      for (const [index, value] of field.enum.entries()) {
        if (typeof value !== field.type) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Enum value type '${typeof value}' does not match field type '${field.type}'`,
            path: ["enum", index],
          });
        }
      }
    }
  });

const workflowInputSchemaDefinitionSchema = z.object({
  allowUnknown: z.boolean().default(false),
  fields: z.record(z.string().min(1), inputFieldDefinitionSchema),
});

const workflowConfigObjectSchema = z.object({
  name: z.string().min(1),
  inputSchema: workflowInputSchemaDefinitionSchema.optional(),
  stageActions: z.record(z.string(), z.array(stageActionSchema)).optional(),
  stages: z.array(z.string().min(1)).min(1),
  rules: z.record(z.string(), z.array(ruleSchema)),
  transitions: z.array(transitionSchema),
});

function isBranchTargetValid(target: string, stageSet: Set<string>) {
  return stageSet.has(target) || target.endsWith("_status");
}

function validateRuleGraph(
  rules: unknown[],
  stageSet: Set<string>,
  ctx: z.RefinementCtx,
  path: Array<string | number>
) {
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index] as Record<string, unknown>;
    const currentPath = [...path, index];

    if (rule.type !== "conditional") {
      continue;
    }

    const onPass = typeof rule.onPass === "string" ? rule.onPass : undefined;
    const onFail = typeof rule.onFail === "string" ? rule.onFail : undefined;

    if (onPass && !isBranchTargetValid(onPass, stageSet)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Conditional rule references unknown branch target '${onPass}'`,
        path: [...currentPath, "onPass"],
      });
    }

    if (onFail && !isBranchTargetValid(onFail, stageSet)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Conditional rule references unknown branch target '${onFail}'`,
        path: [...currentPath, "onFail"],
      });
    }

    if (Array.isArray(rule.subRules)) {
      validateRuleGraph(rule.subRules, stageSet, ctx, [...currentPath, "subRules"]);
    }
  }
}

function validateWorkflowConfig(
  config: z.infer<typeof workflowConfigObjectSchema>,
  ctx: z.RefinementCtx
) {
  const stageSet = new Set<string>();

  for (const [index, stage] of config.stages.entries()) {
    if (stageSet.has(stage)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate stage '${stage}'`,
        path: ["stages", index],
      });
      continue;
    }

    stageSet.add(stage);
  }

  for (const [stageName, rules] of Object.entries(config.rules)) {
    if (!stageSet.has(stageName)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Rules defined for unknown stage '${stageName}'`,
        path: ["rules", stageName],
      });
    }

    validateRuleGraph(rules, stageSet, ctx, ["rules", stageName]);
  }

  for (const [stageName] of Object.entries(config.stageActions ?? {})) {
    if (!stageSet.has(stageName)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Stage actions defined for unknown stage '${stageName}'`,
        path: ["stageActions", stageName],
      });
    }
  }

  for (const [index, transition] of config.transitions.entries()) {
    if (!stageSet.has(transition.from)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Transition references unknown origin stage '${transition.from}'`,
        path: ["transitions", index, "from"],
      });
    }

    if (!stageSet.has(transition.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Transition references unknown destination stage '${transition.to}'`,
        path: ["transitions", index, "to"],
      });
    }
  }
}

export const workflowConfigSchema = workflowConfigObjectSchema.superRefine(validateWorkflowConfig);

const storedWorkflowConfigSchema = workflowConfigObjectSchema
  .extend({
    version: z.number().int().min(1),
    isActive: z.boolean().default(true),
  })
  .superRefine(validateWorkflowConfig);

function logValidationFailure(context: string, error: z.ZodError) {
  logger.error(`Invalid workflow config from ${context}`, {
    issues: error.issues,
  });
}

function extractOptionalDate(
  raw: unknown,
  fieldName: "createdAt" | "updatedAt"
): Date | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const value = (raw as Record<string, unknown>)[fieldName];
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsedDate = new Date(value);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }

  return undefined;
}

function normalizeWorkflowConfig(
  config: z.infer<typeof workflowConfigObjectSchema>
): WorkflowConfig {
  const normalizedInputSchema = config.inputSchema
    ? {
        allowUnknown: config.inputSchema.allowUnknown,
        fields: Object.fromEntries(
          Object.entries(config.inputSchema.fields).map(([fieldName, fieldConfig]) => [
            fieldName,
            {
              ...fieldConfig,
              enum: fieldConfig.enum ? [...fieldConfig.enum] : undefined,
            },
          ])
        ),
      }
    : undefined;

  const normalizedStageActions = config.stageActions
    ? Object.fromEntries(
        Object.entries(config.stageActions).map(([stageName, actions]) => [
          stageName,
          actions.map((action) => ({ ...action })),
        ])
      )
    : undefined;

  return {
    name: config.name,
    ...(normalizedInputSchema ? { inputSchema: normalizedInputSchema } : {}),
    ...(normalizedStageActions ? { stageActions: normalizedStageActions } : {}),
    stages: [...config.stages],
    rules: config.rules as WorkflowConfig["rules"],
    transitions: config.transitions as WorkflowConfig["transitions"],
  };
}

function normalizeStoredWorkflowConfig(
  config: z.infer<typeof storedWorkflowConfigSchema>,
  raw: unknown
): StoredWorkflowConfigRecord {
  return {
    name: config.name,
    version: config.version,
    isActive: config.isActive,
    inputSchema: config.inputSchema
      ? {
          allowUnknown: config.inputSchema.allowUnknown,
          fields: Object.fromEntries(
            Object.entries(config.inputSchema.fields).map(([fieldName, fieldConfig]) => [
              fieldName,
              {
                ...fieldConfig,
                enum: fieldConfig.enum ? [...fieldConfig.enum] : undefined,
              },
            ])
          ),
        }
      : undefined,
    stageActions: config.stageActions
      ? Object.fromEntries(
          Object.entries(config.stageActions).map(([stageName, actions]) => [
            stageName,
            actions.map((action) => ({ ...action })),
          ])
        )
      : undefined,
    stages: [...config.stages],
    rules: config.rules as WorkflowConfig["rules"],
    transitions: config.transitions as WorkflowConfig["transitions"],
    createdAt: extractOptionalDate(raw, "createdAt"),
    updatedAt: extractOptionalDate(raw, "updatedAt"),
  };
}

function parseStoredWorkflowConfig(
  raw: unknown,
  context = "runtime"
): StoredWorkflowConfigRecord | null {
  const parsed = storedWorkflowConfigSchema.safeParse(raw);
  if (!parsed.success) {
    logValidationFailure(context, parsed.error);
    return null;
  }

  return normalizeStoredWorkflowConfig(parsed.data, raw);
}

function countRulesInStage(rules: unknown[]): number {
  let count = 0;

  for (const rawRule of rules) {
    count += 1;

    if (
      rawRule &&
      typeof rawRule === "object" &&
      Array.isArray((rawRule as Record<string, unknown>).subRules)
    ) {
      count += countRulesInStage((rawRule as Record<string, unknown>).subRules as unknown[]);
    }
  }

  return count;
}

function summarizeStoredWorkflowConfig(
  record: StoredWorkflowConfigRecord
): WorkflowConfigSummary {
  const ruleCount = Object.values(record.rules).reduce((total, stageRules) => {
    return total + countRulesInStage(stageRules);
  }, 0);
  const stageActionCount = Object.values(record.stageActions ?? {}).reduce((total, actions) => {
    return total + actions.length;
  }, 0);

  return {
    name: record.name,
    version: record.version,
    isActive: record.isActive,
    inputFieldCount: record.inputSchema ? Object.keys(record.inputSchema.fields).length : 0,
    stageActionCount,
    stageCount: record.stages.length,
    ruleCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function storedRecordToWorkflowConfig(record: StoredWorkflowConfigRecord): WorkflowConfig {
  return {
    name: record.name,
    ...(record.inputSchema ? { inputSchema: record.inputSchema } : {}),
    ...(record.stageActions ? { stageActions: record.stageActions } : {}),
    stages: [...record.stages],
    rules: record.rules,
    transitions: record.transitions,
  };
}

function buildRegistryConfig(name: string): ResolvedWorkflowConfig | null {
  const registryConfig = workflowRegistry[name];
  if (!registryConfig) {
    return null;
  }

  const parsed = workflowConfigSchema.safeParse(registryConfig);
  if (!parsed.success) {
    logValidationFailure(`registry:${name}`, parsed.error);
    return null;
  }

  return {
    config: normalizeWorkflowConfig(parsed.data),
    source: "registry",
    version: 0,
  };
}

async function buildDatabaseConfig(
  name: string,
  version?: number
): Promise<ResolvedWorkflowConfig | null> {
  try {
    await dbConnect();

    let doc;
    if (version !== undefined && version > 0) {
      doc = await WorkflowConfigModel.findOne({ name, version }).lean();
    } else {
      doc = await WorkflowConfigModel.findOne({ name, isActive: true })
        .sort({ version: -1 })
        .lean();

      if (!doc) {
        doc = await WorkflowConfigModel.findOne({ name }).sort({ version: -1 }).lean();
      }
    }

    if (!doc) {
      return null;
    }

    const parsed = parseStoredWorkflowConfig(doc, `database:${name}`);
    if (!parsed) {
      return null;
    }

    return {
      config: storedRecordToWorkflowConfig(parsed),
      source: "database",
      version: parsed.version,
    };
  } catch (error) {
    logger.error(`Failed to load workflow config '${name}' from database`, {
      error,
      version,
    });
    return null;
  }
}

export function parseWorkflowConfig(raw: unknown, context = "runtime"): WorkflowConfig | null {
  const parsed = workflowConfigSchema.safeParse(raw);
  if (!parsed.success) {
    logValidationFailure(context, parsed.error);
    return null;
  }

  return normalizeWorkflowConfig(parsed.data);
}

function buildInputFieldDataSchema(fieldName: string, fieldConfig: InputFieldSchema) {
  let schema: z.ZodTypeAny;

  switch (fieldConfig.type) {
    case "number": {
      let numberSchema = z.number();

      if (fieldConfig.integer) {
        numberSchema = numberSchema.int(`'${fieldName}' must be an integer`);
      }

      if (fieldConfig.min !== undefined) {
        numberSchema = numberSchema.min(
          fieldConfig.min,
          `'${fieldName}' must be at least ${fieldConfig.min}`
        );
      }

      if (fieldConfig.max !== undefined) {
        numberSchema = numberSchema.max(
          fieldConfig.max,
          `'${fieldName}' must be at most ${fieldConfig.max}`
        );
      }
      schema = numberSchema;
      break;
    }
    case "boolean": {
      schema = z.boolean();
      break;
    }
    case "string":
    default: {
      let stringSchema = z.string();

      if (fieldConfig.minLength !== undefined) {
        stringSchema = stringSchema.min(
          fieldConfig.minLength,
          `'${fieldName}' must be at least ${fieldConfig.minLength} characters`
        );
      }

      if (fieldConfig.maxLength !== undefined) {
        stringSchema = stringSchema.max(
          fieldConfig.maxLength,
          `'${fieldName}' must be at most ${fieldConfig.maxLength} characters`
        );
      }

      if (fieldConfig.pattern) {
        const pattern = new RegExp(fieldConfig.pattern);
        stringSchema = stringSchema.regex(pattern, `'${fieldName}' has an invalid format`);
      }
      schema = stringSchema;
      break;
    }
  }

  if (fieldConfig.enum && fieldConfig.enum.length > 0) {
    const allowedValues = [...fieldConfig.enum];
    schema = schema.refine((value: unknown) => allowedValues.includes(value as never), {
      message: `'${fieldName}' must be one of: ${allowedValues.join(", ")}`,
    });
  }

  if (!fieldConfig.required) {
    schema = schema.optional();
  }

  return schema;
}

function buildWorkflowInputDataSchema(config: WorkflowConfig) {
  if (!config.inputSchema) {
    return z.record(z.string(), z.unknown());
  }

  const shape = Object.fromEntries(
    Object.entries(config.inputSchema.fields).map(([fieldName, fieldConfig]) => [
      fieldName,
      buildInputFieldDataSchema(fieldName, fieldConfig),
    ])
  ) as Record<string, z.ZodTypeAny>;

  const schema = z.object(shape);
  return config.inputSchema.allowUnknown ? schema.passthrough() : schema.strict();
}

export function validateWorkflowInput(config: WorkflowConfig, inputData: unknown) {
  return buildWorkflowInputDataSchema(config).safeParse(inputData);
}

export async function getWorkflowConfig(
  name: string,
  options: WorkflowConfigLookupOptions = {}
): Promise<ResolvedWorkflowConfig | null> {
  if (options.source === "registry") {
    return buildRegistryConfig(name);
  }

  const databaseConfig = await buildDatabaseConfig(name, options.version);
  if (databaseConfig) {
    return databaseConfig;
  }

  if (options.source === "database") {
    return null;
  }

  return buildRegistryConfig(name);
}

export async function getStoredWorkflowConfigRecord(
  name: string,
  version?: number
): Promise<StoredWorkflowConfigRecord | null> {
  try {
    await dbConnect();

    let doc;
    if (version !== undefined && version > 0) {
      doc = await WorkflowConfigModel.findOne({ name, version }).lean();
    } else {
      doc = await WorkflowConfigModel.findOne({ name, isActive: true })
        .sort({ version: -1 })
        .lean();

      if (!doc) {
        doc = await WorkflowConfigModel.findOne({ name }).sort({ version: -1 }).lean();
      }
    }

    if (!doc) {
      return null;
    }

    return parseStoredWorkflowConfig(doc, `database:${name}`);
  } catch (error) {
    logger.error(`Failed to fetch stored workflow config '${name}'`, {
      error,
      version,
    });
    return null;
  }
}

export async function listStoredWorkflowConfigs(
  name?: string
): Promise<WorkflowConfigSummary[]> {
  try {
    await dbConnect();

    const query = name ? { name } : {};
    const docs = (await WorkflowConfigModel.find(query)
      .sort({ name: 1, version: -1 })
      .lean()) as unknown[];

    return docs
      .map((doc, index) =>
        parseStoredWorkflowConfig(doc, name ? `database:${name}:${index}` : `database:list:${index}`)
      )
      .filter((record): record is StoredWorkflowConfigRecord => record !== null)
      .map(summarizeStoredWorkflowConfig);
  } catch (error) {
    logger.error("Failed to list stored workflow configs", {
      error,
      name,
    });
    return [];
  }
}

export async function activateWorkflowConfigVersion(
  name: string,
  version: number
): Promise<StoredWorkflowConfigRecord | null> {
  try {
    await dbConnect();

    const existing = await WorkflowConfigModel.findOne({ name, version }).lean();
    if (!existing) {
      return null;
    }

    await WorkflowConfigModel.updateMany({ name }, { $set: { isActive: false } });
    await WorkflowConfigModel.updateOne({ name, version }, { $set: { isActive: true } });

    const activated = await WorkflowConfigModel.findOne({ name, version }).lean();
    if (!activated) {
      return null;
    }

    return parseStoredWorkflowConfig(activated, `database:${name}:${version}`);
  } catch (error) {
    logger.error(`Failed to activate workflow config '${name}' version ${version}`, {
      error,
    });
    return null;
  }
}

export async function createWorkflowConfigVersion(
  config: WorkflowConfig,
  options: { activate?: boolean } = {}
): Promise<StoredWorkflowConfigRecord | null> {
  try {
    await dbConnect();

    const normalizedConfig = parseWorkflowConfig(config, `create:${config.name}`);
    if (!normalizedConfig) {
      return null;
    }

    const latestDoc = await WorkflowConfigModel.findOne({ name: normalizedConfig.name })
      .sort({ version: -1 })
      .lean();

    const latestRecord = latestDoc
      ? parseStoredWorkflowConfig(latestDoc, `database:${normalizedConfig.name}:latest`)
      : null;
    if (latestDoc && !latestRecord) {
      return null;
    }

    const nextVersion = latestRecord ? latestRecord.version + 1 : 1;
    const shouldActivate = options.activate !== false;

    const createdDoc = await WorkflowConfigModel.create({
      ...normalizedConfig,
      version: nextVersion,
      isActive: false,
    });

    if (shouldActivate) {
      return activateWorkflowConfigVersion(normalizedConfig.name, nextVersion);
    }

    return parseStoredWorkflowConfig(
      createdDoc.toObject(),
      `database:${normalizedConfig.name}:${nextVersion}`
    );
  } catch (error) {
    logger.error(`Failed to create workflow config '${config.name}'`, {
      error,
    });
    return null;
  }
}

async function getLatestStoredWorkflowConfigRecord(
  name: string
): Promise<StoredWorkflowConfigRecord | null> {
  try {
    await dbConnect();

    const latestDoc = await WorkflowConfigModel.findOne({ name }).sort({ version: -1 }).lean();
    if (!latestDoc) {
      return null;
    }

    return parseStoredWorkflowConfig(latestDoc, `database:${name}:latest`);
  } catch (error) {
    logger.error(`Failed to fetch latest workflow config '${name}'`, {
      error,
    });
    return null;
  }
}

function areWorkflowConfigsEquivalent(a: WorkflowConfig, b: WorkflowConfig) {
  const normalizedA = parseWorkflowConfig(a, "compare:left");
  const normalizedB = parseWorkflowConfig(b, "compare:right");

  if (!normalizedA || !normalizedB) {
    return false;
  }

  return JSON.stringify(normalizedA) === JSON.stringify(normalizedB);
}

export async function seedRegistryWorkflowConfigs(options: {
  names?: string[];
  activate?: boolean;
} = {}): Promise<WorkflowSeedResult[]> {
  const names = options.names ?? Object.keys(workflowRegistry);
  const results: WorkflowSeedResult[] = [];

  for (const name of names) {
    const registryConfig = buildRegistryConfig(name);
    if (!registryConfig) {
      continue;
    }

    const latestStoredConfig = await getLatestStoredWorkflowConfigRecord(name);
    if (latestStoredConfig) {
      const matchesLatest = areWorkflowConfigsEquivalent(
        registryConfig.config,
        storedRecordToWorkflowConfig(latestStoredConfig)
      );

      if (matchesLatest) {
        if (options.activate !== false && !latestStoredConfig.isActive) {
          const activated = await activateWorkflowConfigVersion(name, latestStoredConfig.version);
          if (activated) {
            results.push({
              name,
              version: activated.version,
              isActive: activated.isActive,
              action: "activated",
            });
            continue;
          }
        }

        results.push({
          name,
          version: latestStoredConfig.version,
          isActive: latestStoredConfig.isActive,
          action: "skipped",
        });
        continue;
      }
    }

    const created = await createWorkflowConfigVersion(registryConfig.config, {
      activate: options.activate,
    });
    if (!created) {
      continue;
    }

    results.push({
      name,
      version: created.version,
      isActive: created.isActive,
      action: "created",
    });
  }

  return results;
}
