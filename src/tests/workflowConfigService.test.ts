import dbConnect from "@/lib/mongodb";
import { workflowRegistry } from "@/config/workflows";
import { WorkflowConfigModel } from "@/models/WorkflowConfig";
import {
  getWorkflowConfig,
  parseWorkflowConfig,
  validateWorkflowInput,
} from "@/services/workflowConfigService";

jest.mock("@/lib/mongodb", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("@/models/WorkflowConfig", () => ({
  WorkflowConfigModel: {
    findOne: jest.fn(),
  },
}));

function createQueryResult(result: unknown) {
  return {
    sort: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(result),
    }),
    lean: jest.fn().mockResolvedValue(result),
  };
}

describe("workflowConfigService", () => {
  const mockedDbConnect = dbConnect as unknown as jest.Mock;
  const mockedFindOne = WorkflowConfigModel.findOne as unknown as jest.Mock;

  beforeEach(() => {
    mockedDbConnect.mockResolvedValue(undefined);
    mockedFindOne.mockReset();
  });

  it("falls back to the registry when no database config exists", async () => {
    mockedFindOne
      .mockReturnValueOnce(createQueryResult(null))
      .mockReturnValueOnce(createQueryResult(null));

    const resolved = await getWorkflowConfig("loan_application");

    expect(resolved).toMatchObject({
      source: "registry",
      version: 0,
      config: {
        name: "loan_application",
      },
    });
    expect(mockedFindOne).toHaveBeenNthCalledWith(1, {
      name: "loan_application",
      isActive: true,
    });
    expect(mockedFindOne).toHaveBeenNthCalledWith(2, {
      name: "loan_application",
    });
  });

  it("returns an exact database version when requested", async () => {
    mockedFindOne.mockReturnValueOnce(
      createQueryResult({
        name: "loan_application",
        version: 3,
        isActive: false,
        stages: ["intake", "decision"],
        rules: {
          intake: [],
          decision: [],
        },
        transitions: [
          {
            from: "intake",
            to: "decision",
            condition: "on_success",
          },
        ],
      })
    );

    const resolved = await getWorkflowConfig("loan_application", {
      source: "database",
      version: 3,
    });

    expect(resolved).toEqual({
      source: "database",
      version: 3,
      config: {
        name: "loan_application",
        stages: ["intake", "decision"],
        rules: {
          intake: [],
          decision: [],
        },
        transitions: [
          {
            from: "intake",
            to: "decision",
            condition: "on_success",
          },
        ],
      },
    });
    expect(mockedFindOne).toHaveBeenCalledWith({
      name: "loan_application",
      version: 3,
    });
  });

  it("rejects invalid workflow graphs during validation", () => {
    const parsed = parseWorkflowConfig(
      {
        name: "broken_workflow",
        stages: ["intake"],
        rules: {
          intake: [],
        },
        transitions: [
          {
            from: "intake",
            to: "missing_stage",
            condition: "on_success",
          },
        ],
      },
      "test"
    );

    expect(parsed).toBeNull();
  });

  it("accepts every registry example workflow", () => {
    for (const [name, config] of Object.entries(workflowRegistry)) {
      const parsed = parseWorkflowConfig(config, `test:${name}`);
      expect(parsed).not.toBeNull();
    }
  });

  it("rejects stage actions configured for an unknown stage", () => {
    const parsed = parseWorkflowConfig(
      {
        name: "broken_actions",
        stages: ["intake"],
        stageActions: {
          scoring: [
            {
              id: "action-1",
              type: "fetch_external_score",
              targetField: "external_score",
            },
          ],
        },
        rules: {
          intake: [],
        },
        transitions: [],
      },
      "test"
    );

    expect(parsed).toBeNull();
  });

  it("validates request input against a workflow input schema", async () => {
    mockedFindOne
      .mockReturnValueOnce(createQueryResult(null))
      .mockReturnValueOnce(createQueryResult(null));

    const resolved = await getWorkflowConfig("loan_application");
    expect(resolved).not.toBeNull();

    const invalid = validateWorkflowInput(resolved!.config, {
      amount: "5000",
      credit_score: 720,
    });

    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.format()).toMatchObject({
        amount: expect.any(Object),
        external_verification: expect.any(Object),
      });
    }

    const valid = validateWorkflowInput(resolved!.config, {
      amount: 5000,
      credit_score: 720,
      external_verification: "passed",
    });

    expect(valid.success).toBe(true);
  });
});
