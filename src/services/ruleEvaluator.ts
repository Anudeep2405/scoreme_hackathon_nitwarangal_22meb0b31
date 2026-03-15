import { Rule } from "@/config/workflows";
import { getValueAtPath } from "@/lib/objectPath";

export interface EvaluationResult {
  passed: boolean;
  field?: string;
  expected?: unknown;
  actual?: unknown;
}

export function evaluateRule(rule: Rule, input: Record<string, unknown>): EvaluationResult {
  switch (rule.type) {
    case "required_field": {
      if (!rule.field) return { passed: false };
      const value = getValueAtPath(input, rule.field);
      const passed = value !== undefined && value !== null && value !== "";
      return { passed, field: rule.field, actual: value };
    }
    
    case "greater_than": {
      if (!rule.field || typeof rule.value !== "number") return { passed: false };
      const value = Number(getValueAtPath(input, rule.field));
      const passed = !isNaN(value) && value > rule.value;
      return { passed, field: rule.field, expected: `> ${rule.value}`, actual: value };
    }

    case "equals": {
      if (!rule.field || rule.value === undefined) return { passed: false };
      const value = getValueAtPath(input, rule.field);
      const passed = value === rule.value;
      return { passed, field: rule.field, expected: rule.value, actual: value };
    }

    case "conditional": {
      if (!rule.subRules || rule.subRules.length === 0) return { passed: false };
      
      // All subrules must pass for conditional to pass (AND logic logic)
      let allPassed = true;
      for (const sub of rule.subRules) {
        const res = evaluateRule(sub, input);
        if (!res.passed) {
          allPassed = false;
          break;
        }
      }
      return { passed: allPassed };
    }

    default:
      return { passed: false };
  }
}
