export type RuleType = "required_field" | "greater_than" | "equals" | "conditional";
export type InputFieldType = "string" | "number" | "boolean";
export type StageActionType = "fetch_external_score";

export interface InputFieldSchema {
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

export interface WorkflowInputSchema {
  fields: Record<string, InputFieldSchema>;
  allowUnknown?: boolean;
}

export interface FetchExternalScoreStageAction {
  id: string;
  type: "fetch_external_score";
  targetField: string;
  processedFlagField?: string;
  historyMessage?: string;
}

export type StageAction = FetchExternalScoreStageAction;

export interface Rule {
  id: string;
  type: RuleType;
  field?: string;
  value?: string | number | boolean;
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
  inputSchema?: WorkflowInputSchema;
  stageActions?: Record<string, StageAction[]>;
  stages: string[];
  rules: Record<string, Rule[]>; // map of stageName -> Rule[]
  transitions: Transition[];
}

export const workflowRegistry: Record<string, WorkflowConfig> = {
  loan_application: {
    name: "loan_application",
    inputSchema: {
      allowUnknown: false,
      fields: {
        amount: {
          type: "number",
          required: true,
          min: 1,
          description: "Requested loan amount",
        },
        credit_score: {
          type: "number",
          required: true,
          integer: true,
          min: 300,
          max: 850,
          description: "Applicant credit score",
        },
        external_verification: {
          type: "string",
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
          type: "fetch_external_score",
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
  application_approval: {
    name: "application_approval",
    inputSchema: {
      allowUnknown: false,
      fields: {
        applicant_name: {
          type: "string",
          required: true,
          minLength: 2,
          description: "Applicant full name",
        },
        requested_amount: {
          type: "number",
          required: true,
          min: 100,
          description: "Requested approval amount",
        },
        applicant_score: {
          type: "number",
          required: true,
          integer: true,
          min: 0,
          max: 100,
          description: "Internal application score from 0 to 100",
        },
        documents_complete: {
          type: "boolean",
          required: true,
          description: "Whether the submitted document set is complete",
        },
        background_check: {
          type: "string",
          required: true,
          enum: ["passed", "failed", "pending"],
          description: "Background screening result",
        },
      },
    },
    stages: ["intake", "screening", "review", "approval"],
    rules: {
      intake: [
        {
          id: "rule_application_intake_1",
          type: "required_field",
          field: "applicant_name",
        },
        {
          id: "rule_application_intake_2",
          type: "greater_than",
          field: "requested_amount",
          value: 99,
        },
        {
          id: "rule_application_intake_3",
          type: "required_field",
          field: "applicant_score",
        },
      ],
      screening: [
        {
          id: "rule_application_screening_1",
          type: "greater_than",
          field: "applicant_score",
          value: 69,
        },
      ],
      review: [
        {
          id: "rule_application_review_1",
          type: "equals",
          field: "documents_complete",
          value: true,
        },
      ],
      approval: [
        {
          id: "rule_application_approval_1",
          type: "equals",
          field: "background_check",
          value: "passed",
        },
      ],
    },
    transitions: [
      { from: "intake", to: "screening", condition: "on_success" },
      { from: "screening", to: "approval", condition: "on_success" },
      { from: "screening", to: "review", condition: "on_failure" },
      { from: "review", to: "approval", condition: "on_success" },
    ],
  },
  claim_processing: {
    name: "claim_processing",
    inputSchema: {
      allowUnknown: false,
      fields: {
        claim_amount: {
          type: "number",
          required: true,
          min: 1,
          description: "Requested claim amount",
        },
        policy_active: {
          type: "boolean",
          required: true,
          description: "Whether the policy is active",
        },
        incident_confirmed: {
          type: "boolean",
          required: true,
          description: "Whether the incident has been confirmed",
        },
        document_package: {
          type: "string",
          required: true,
          enum: ["complete", "partial", "missing"],
          description: "Claim documentation completeness",
        },
        payout_approved: {
          type: "boolean",
          required: true,
          description: "Final adjuster payout approval",
        },
      },
    },
    stageActions: {
      fraud_screening: [
        {
          id: "action_claim_fraud_screening_1",
          type: "fetch_external_score",
          targetField: "fraud_score",
          processedFlagField: "fraud_score_processed",
          historyMessage: "Fetched fraud screening score",
        },
      ],
    },
    stages: ["intake", "fraud_screening", "assessment", "payout_decision"],
    rules: {
      intake: [
        {
          id: "rule_claim_intake_1",
          type: "greater_than",
          field: "claim_amount",
          value: 0,
        },
        {
          id: "rule_claim_intake_2",
          type: "equals",
          field: "policy_active",
          value: true,
        },
      ],
      fraud_screening: [
        {
          id: "rule_claim_fraud_screening_1",
          type: "conditional",
          subRules: [
            {
              id: "sub_claim_fraud_screening_1",
              type: "greater_than",
              field: "fraud_score",
              value: 549,
            },
          ],
          onPass: "assessment",
          onFail: "manual_review_status",
        },
      ],
      assessment: [
        {
          id: "rule_claim_assessment_1",
          type: "equals",
          field: "incident_confirmed",
          value: true,
        },
        {
          id: "rule_claim_assessment_2",
          type: "equals",
          field: "document_package",
          value: "complete",
        },
      ],
      payout_decision: [
        {
          id: "rule_claim_payout_1",
          type: "equals",
          field: "payout_approved",
          value: true,
        },
      ],
    },
    transitions: [
      { from: "intake", to: "fraud_screening", condition: "on_success" },
      { from: "fraud_screening", to: "assessment", condition: "on_success" },
      { from: "assessment", to: "payout_decision", condition: "on_success" },
    ],
  },
  employee_onboarding: {
    name: "employee_onboarding",
    inputSchema: {
      allowUnknown: false,
      fields: {
        employee_name: {
          type: "string",
          required: true,
          minLength: 2,
          description: "Employee full name",
        },
        start_date_confirmed: {
          type: "boolean",
          required: true,
          description: "Whether the employee start date is confirmed",
        },
        manager_approved: {
          type: "boolean",
          required: true,
          description: "Whether the hiring manager approved onboarding",
        },
        background_check: {
          type: "string",
          required: true,
          enum: ["passed", "failed", "pending"],
          description: "Background verification outcome",
        },
        equipment_ready: {
          type: "boolean",
          required: true,
          description: "Whether the employee equipment is ready",
        },
        payroll_setup: {
          type: "boolean",
          required: true,
          description: "Whether payroll setup is complete",
        },
        manual_setup_override: {
          type: "boolean",
          required: false,
          description: "Manual HR or IT override to continue onboarding",
        },
      },
    },
    stages: ["intake", "approvals", "provisioning", "manual_setup", "launch"],
    rules: {
      intake: [
        {
          id: "rule_onboarding_intake_1",
          type: "required_field",
          field: "employee_name",
        },
        {
          id: "rule_onboarding_intake_2",
          type: "equals",
          field: "start_date_confirmed",
          value: true,
        },
      ],
      approvals: [
        {
          id: "rule_onboarding_approvals_1",
          type: "equals",
          field: "manager_approved",
          value: true,
        },
        {
          id: "rule_onboarding_approvals_2",
          type: "equals",
          field: "background_check",
          value: "passed",
        },
      ],
      provisioning: [
        {
          id: "rule_onboarding_provisioning_1",
          type: "equals",
          field: "equipment_ready",
          value: true,
        },
        {
          id: "rule_onboarding_provisioning_2",
          type: "equals",
          field: "payroll_setup",
          value: true,
        },
      ],
      manual_setup: [
        {
          id: "rule_onboarding_manual_setup_1",
          type: "equals",
          field: "manual_setup_override",
          value: true,
        },
      ],
      launch: [],
    },
    transitions: [
      { from: "intake", to: "approvals", condition: "on_success" },
      { from: "approvals", to: "provisioning", condition: "on_success" },
      { from: "provisioning", to: "launch", condition: "on_success" },
      { from: "provisioning", to: "manual_setup", condition: "on_failure" },
      { from: "manual_setup", to: "launch", condition: "on_success" },
    ],
  },
  vendor_approval: {
    name: "vendor_approval",
    inputSchema: {
      allowUnknown: false,
      fields: {
        vendor_name: {
          type: "string",
          required: true,
          minLength: 2,
          description: "Vendor legal name",
        },
        contract_value: {
          type: "number",
          required: true,
          min: 1,
          description: "Annual contract value",
        },
        compliance_check: {
          type: "string",
          required: true,
          enum: ["passed", "failed", "pending"],
          description: "Compliance review status",
        },
        tax_documents_complete: {
          type: "boolean",
          required: true,
          description: "Whether tax documents are complete",
        },
        banking_verified: {
          type: "boolean",
          required: true,
          description: "Whether banking details are verified",
        },
      },
    },
    stageActions: {
      risk_review: [
        {
          id: "action_vendor_risk_review_1",
          type: "fetch_external_score",
          targetField: "vendor_risk_score",
          processedFlagField: "vendor_risk_score_processed",
          historyMessage: "Fetched vendor risk score",
        },
      ],
    },
    stages: ["intake", "compliance", "risk_review", "final_approval"],
    rules: {
      intake: [
        {
          id: "rule_vendor_intake_1",
          type: "required_field",
          field: "vendor_name",
        },
        {
          id: "rule_vendor_intake_2",
          type: "greater_than",
          field: "contract_value",
          value: 0,
        },
        {
          id: "rule_vendor_intake_3",
          type: "equals",
          field: "tax_documents_complete",
          value: true,
        },
      ],
      compliance: [
        {
          id: "rule_vendor_compliance_1",
          type: "equals",
          field: "compliance_check",
          value: "passed",
        },
      ],
      risk_review: [
        {
          id: "rule_vendor_risk_review_1",
          type: "conditional",
          subRules: [
            {
              id: "sub_vendor_risk_review_1",
              type: "greater_than",
              field: "vendor_risk_score",
              value: 599,
            },
            {
              id: "sub_vendor_risk_review_2",
              type: "equals",
              field: "banking_verified",
              value: true,
            },
          ],
          onPass: "final_approval",
          onFail: "manual_review_status",
        },
      ],
      final_approval: [],
    },
    transitions: [
      { from: "intake", to: "compliance", condition: "on_success" },
      { from: "compliance", to: "risk_review", condition: "on_success" },
      { from: "risk_review", to: "final_approval", condition: "on_success" },
    ],
  },
  document_verification: {
    name: "document_verification",
    inputSchema: {
      allowUnknown: false,
      fields: {
        document_type: {
          type: "string",
          required: true,
          enum: ["passport", "license", "invoice", "contract"],
          description: "Type of document being verified",
        },
        file_uploaded: {
          type: "boolean",
          required: true,
          description: "Whether the file was uploaded",
        },
        metadata_complete: {
          type: "boolean",
          required: true,
          description: "Whether the document metadata is complete",
        },
        authenticity_check: {
          type: "string",
          required: true,
          enum: ["passed", "failed", "pending"],
          description: "Automated authenticity check result",
        },
        reviewer_confirmed: {
          type: "boolean",
          required: true,
          description: "Manual reviewer confirmation",
        },
      },
    },
    stages: ["intake", "automated_checks", "reviewer_validation", "archive"],
    rules: {
      intake: [
        {
          id: "rule_document_intake_1",
          type: "equals",
          field: "file_uploaded",
          value: true,
        },
        {
          id: "rule_document_intake_2",
          type: "equals",
          field: "metadata_complete",
          value: true,
        },
      ],
      automated_checks: [
        {
          id: "rule_document_automated_checks_1",
          type: "conditional",
          subRules: [
            {
              id: "sub_document_automated_checks_1",
              type: "equals",
              field: "authenticity_check",
              value: "passed",
            },
          ],
          onPass: "reviewer_validation",
          onFail: "manual_review_status",
        },
      ],
      reviewer_validation: [
        {
          id: "rule_document_reviewer_validation_1",
          type: "equals",
          field: "reviewer_confirmed",
          value: true,
        },
      ],
      archive: [],
    },
    transitions: [
      { from: "intake", to: "automated_checks", condition: "on_success" },
      { from: "automated_checks", to: "reviewer_validation", condition: "on_success" },
      { from: "reviewer_validation", to: "archive", condition: "on_success" },
    ],
  },
};
