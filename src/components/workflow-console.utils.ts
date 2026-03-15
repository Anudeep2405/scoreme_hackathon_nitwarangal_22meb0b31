import {
  InputFieldDefinition,
  WorkflowConfigDetail,
  WorkflowRule,
} from "./workflow-console.types";

export function stringifyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function createWorkflowKey(name: string, version: number) {
  return `${name}::${version}`;
}

export function formatDate(value?: string) {
  if (!value) {
    return "Not available";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsedDate);
}

export function countNestedRules(rules: WorkflowRule[]): number {
  return rules.reduce((total, rule) => total + 1 + countNestedRules(rule.subRules ?? []), 0);
}

export function formatEnumValues(values?: Array<string | number | boolean>) {
  return values?.map((value) => String(value)).join(", ") ?? "";
}

export function sampleValueForField(field: InputFieldDefinition) {
  if (field.enum && field.enum.length > 0) {
    return field.enum[0];
  }

  if (field.type === "number") {
    if (field.min !== undefined) {
      return field.min;
    }

    return field.integer ? 1 : 0;
  }

  if (field.type === "boolean") {
    return false;
  }

  if (field.description) {
    const hint = field.description
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join("_")
      .toLowerCase();

    if (hint) {
      return hint;
    }
  }

  return "sample";
}

export function buildRequestSample(config?: WorkflowConfigDetail | null) {
  if (!config?.inputSchema?.fields) {
    return stringifyJson({});
  }

  const sample = Object.fromEntries(
    Object.entries(config.inputSchema.fields).map(([fieldName, fieldConfig]) => [
      fieldName,
      sampleValueForField(fieldConfig),
    ])
  );

  return stringifyJson(sample);
}
