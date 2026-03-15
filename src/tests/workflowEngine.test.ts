import type { WorkflowConfig } from "@/config/workflows";
import dbConnect from "@/lib/mongodb";
import { Request } from "@/models/Request";
import { WorkflowEngine } from "@/services/workflowEngine";
import { logAuditEvent } from "@/services/auditService";
import { runStageActions } from "@/services/stageActionService";
import { getWorkflowConfig, parseWorkflowConfig } from "@/services/workflowConfigService";

jest.mock("@/lib/mongodb", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("@/models/Request", () => ({
  Request: {
    findOne: jest.fn(),
  },
}));

jest.mock("@/services/workflowConfigService", () => ({
  getWorkflowConfig: jest.fn(),
  parseWorkflowConfig: jest.fn(),
}));

jest.mock("@/services/stageActionService", () => ({
  runStageActions: jest.fn(),
}));

jest.mock("@/services/auditService", () => ({
  logAuditEvent: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

type MockRequestState = {
  requestId: string;
  idempotencyKey: string;
  workflowName: string;
  workflowVersion: number;
  workflowSource: "database" | "registry";
  workflowConfigSnapshot?: Record<string, unknown>;
  input: Record<string, unknown>;
  currentStage: string;
  status: "processing" | "approved" | "rejected" | "manual_review" | "error";
  history: Array<{ stage: string; action: string; timestamp: Date }>;
  rulesTriggered: Array<{ ruleId: string; passed: boolean; details?: string }>;
  decisions: Array<{ stage: string; decision: string; reasoning?: string }>;
  reasoning: string;
  markModified: jest.Mock;
  save: jest.Mock<Promise<void>, []>;
};

function createRequestState(input: Record<string, unknown>): MockRequestState {
  return {
    requestId: "req-123",
    idempotencyKey: "idem-123",
    workflowName: "engine_transition_test",
    workflowVersion: 1,
    workflowSource: "registry",
    input,
    currentStage: "intake",
    status: "processing",
    history: [],
    rulesTriggered: [],
    decisions: [],
    reasoning: "",
    markModified: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function createConfig(transitions: WorkflowConfig["transitions"]): WorkflowConfig {
  return {
    name: "engine_transition_test",
    stages: ["intake", "review"],
    rules: {
      intake: [
        {
          id: "require_amount",
          type: "required_field",
          field: "amount",
        },
      ],
      review: [],
    },
    transitions,
  };
}

describe("WorkflowEngine", () => {
  const mockedDbConnect = dbConnect as unknown as jest.Mock;
  const mockedFindOne = Request.findOne as unknown as jest.Mock;
  const mockedGetWorkflowConfig = getWorkflowConfig as unknown as jest.Mock;
  const mockedParseWorkflowConfig = parseWorkflowConfig as unknown as jest.Mock;
  const mockedRunStageActions = runStageActions as unknown as jest.Mock;
  const mockedLogAuditEvent = logAuditEvent as unknown as jest.Mock;

  beforeEach(() => {
    mockedDbConnect.mockResolvedValue(undefined);
    mockedFindOne.mockReset();
    mockedGetWorkflowConfig.mockReset();
    mockedParseWorkflowConfig.mockReset();
    mockedRunStageActions.mockReset();
    mockedLogAuditEvent.mockReset();

    mockedParseWorkflowConfig.mockReturnValue(null);
    mockedRunStageActions.mockResolvedValue(undefined);
    mockedLogAuditEvent.mockResolvedValue(undefined);
  });

  it("follows an explicit on_failure transition instead of rejecting immediately", async () => {
    const requestState = createRequestState({});
    const config = createConfig([
      {
        from: "intake",
        to: "review",
        condition: "on_failure",
      },
    ]);

    mockedFindOne.mockResolvedValue(requestState);
    mockedGetWorkflowConfig.mockResolvedValue({
      source: "registry",
      version: 0,
      config,
    });

    const result = await WorkflowEngine.processRequest(requestState.requestId);

    expect(result.status).toBe("approved");
    expect(result.currentStage).toBe("review");
    expect(result.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "intake",
          action: "Transitioned to review",
        }),
      ])
    );
    expect(result.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "intake", decision: "move to review" }),
        expect.objectContaining({ stage: "review", decision: "approved" }),
      ])
    );
    expect(result.decisions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ stage: "intake", decision: "rejected" })])
    );
  });

  it("does not take an on_failure transition when the stage passes", async () => {
    const requestState = createRequestState({ amount: 5000 });
    const config = createConfig([
      {
        from: "intake",
        to: "review",
        condition: "on_failure",
      },
    ]);

    mockedFindOne.mockResolvedValue(requestState);
    mockedGetWorkflowConfig.mockResolvedValue({
      source: "registry",
      version: 0,
      config,
    });

    const result = await WorkflowEngine.processRequest(requestState.requestId);

    expect(result.status).toBe("approved");
    expect(result.currentStage).toBe("intake");
    expect(result.history).toHaveLength(0);
    expect(result.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "intake",
          decision: "approved",
          reasoning: "End of workflow",
        }),
      ])
    );
  });

  it("still rejects failed stages that have no on_failure transition", async () => {
    const requestState = createRequestState({});
    const config = createConfig([]);

    mockedFindOne.mockResolvedValue(requestState);
    mockedGetWorkflowConfig.mockResolvedValue({
      source: "registry",
      version: 0,
      config,
    });

    const result = await WorkflowEngine.processRequest(requestState.requestId);

    expect(result.status).toBe("rejected");
    expect(result.currentStage).toBe("intake");
    expect(result.reasoning).toBe("Failed at stage intake");
    expect(result.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "intake",
          decision: "rejected",
          reasoning: "Rule failure",
        }),
      ])
    );
  });
});
