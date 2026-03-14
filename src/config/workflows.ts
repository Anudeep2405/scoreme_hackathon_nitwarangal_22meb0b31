export type RuleType = "required_field" | "greater_than" | "equals" | "conditional";

export interface Rule {
  id: string;
  type: RuleType;
  field?: string;
  value?: any;
  onPass?: string;     // Next stage or status if rule passes
  onFail?: string;     // Next stage or status if rule fails
  subRules?: Rule[];   // For conditional branches
}

export interface Transition {
  from: string;
  to: string;
  condition?: "always" | "on_success" | "on_failure";
}

export interface WorkflowConfig {
  name: string;
  stages: string[];
  rules: Record<string, Rule[]>; // map of stageName -> Rule[]
  transitions: Transition[];
}

export const workflowRegistry: Record<string, WorkflowConfig> = {
  loan_application: {
    name: "loan_application",
    stages: ["intake", "scoring", "decision"],
    rules: {
      intake: [
        {
          id: "rule_intake_1",
          type: "required_field",
          field: "amount",
        },
        {
          id: "rule_intake_2",
          type: "required_field",
          field: "credit_score",
        },
        {
          id: "rule_intake_3",
          type: "greater_than",
          field: "amount",
          value: 0,
        }
      ],
      scoring: [
        {
          id: "rule_scoring_1",
          type: "conditional",
          subRules: [
            {
              id: "sub_scoring_1",
              type: "greater_than",
              field: "credit_score",
              value: 600,
            }
          ],
          onPass: "decision",
          onFail: "rejected_status",
        }
      ],
      decision: [
        {
          id: "rule_decision_1",
          type: "equals",
          field: "external_verification",
          value: "passed",
        }
      ]
    },
    transitions: [
      { from: "intake", to: "scoring", condition: "on_success" },
      { from: "scoring", to: "decision", condition: "on_success" },
      // Terminal states are not strictly "stages" to transition to, 
      // they are "statuses". For example: approved, rejected.
    ],
  },
};
