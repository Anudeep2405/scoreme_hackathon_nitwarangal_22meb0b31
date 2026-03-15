import dbConnect from "@/lib/mongodb";
import { workflowRegistry } from "@/config/workflows";
import { WorkflowConfigModel } from "@/models/WorkflowConfig";
import {
  activateWorkflowConfigVersion,
  createWorkflowConfigVersion,
  listStoredWorkflowConfigs,
  seedRegistryWorkflowConfigs,
} from "@/services/workflowConfigService";

jest.mock("@/lib/mongodb", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("@/models/WorkflowConfig", () => ({
  WorkflowConfigModel: {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    updateOne: jest.fn(),
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

describe("workflow config admin service", () => {
  const mockedDbConnect = dbConnect as unknown as jest.Mock;
  const mockedFindOne = WorkflowConfigModel.findOne as unknown as jest.Mock;
  const mockedFind = WorkflowConfigModel.find as unknown as jest.Mock;
  const mockedCreate = WorkflowConfigModel.create as unknown as jest.Mock;
  const mockedUpdateMany = WorkflowConfigModel.updateMany as unknown as jest.Mock;
  const mockedUpdateOne = WorkflowConfigModel.updateOne as unknown as jest.Mock;

  beforeEach(() => {
    mockedDbConnect.mockResolvedValue(undefined);
    mockedFindOne.mockReset();
    mockedFind.mockReset();
    mockedCreate.mockReset();
    mockedUpdateMany.mockReset();
    mockedUpdateOne.mockReset();
  });

  it("creates the next version and activates it by default", async () => {
    const config = {
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
          condition: "on_success" as const,
        },
      ],
    };

    mockedFindOne
      .mockReturnValueOnce(
        createQueryResult({
          name: "loan_application",
          version: 2,
          isActive: true,
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
      )
      .mockReturnValueOnce(
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
      )
      .mockReturnValueOnce(
        createQueryResult({
          name: "loan_application",
          version: 3,
          isActive: true,
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

    mockedCreate.mockResolvedValue({
      toObject: () => ({
        ...config,
        version: 3,
        isActive: false,
      }),
    });
    mockedUpdateMany.mockResolvedValue({ acknowledged: true });
    mockedUpdateOne.mockResolvedValue({ acknowledged: true });

    const result = await createWorkflowConfigVersion(config);

    expect(mockedCreate).toHaveBeenCalledWith({
      ...config,
      version: 3,
      isActive: false,
    });
    expect(mockedUpdateMany).toHaveBeenCalledWith(
      { name: "loan_application" },
      { $set: { isActive: false } }
    );
    expect(mockedUpdateOne).toHaveBeenCalledWith(
      { name: "loan_application", version: 3 },
      { $set: { isActive: true } }
    );
    expect(result).toMatchObject({
      name: "loan_application",
      version: 3,
      isActive: true,
    });
  });

  it("lists workflow config summaries with stage and rule counts", async () => {
    mockedFind.mockReturnValueOnce(
      createQueryResult([
        {
          name: "loan_application",
          version: 2,
          isActive: true,
          stages: ["intake", "decision"],
          rules: {
            intake: [
              {
                id: "rule-1",
                type: "required_field",
                field: "amount",
              },
            ],
            decision: [
              {
                id: "rule-2",
                type: "conditional",
                onPass: "approved_status",
                onFail: "rejected_status",
                subRules: [
                  {
                    id: "rule-2a",
                    type: "equals",
                    field: "external_verification",
                    value: "passed",
                  },
                ],
              },
            ],
          },
          transitions: [
            {
              from: "intake",
              to: "decision",
              condition: "on_success",
            },
          ],
        },
      ])
    );

    const result = await listStoredWorkflowConfigs("loan_application");

    expect(mockedFind).toHaveBeenCalledWith({ name: "loan_application" });
    expect(result).toEqual([
      expect.objectContaining({
        name: "loan_application",
        version: 2,
        isActive: true,
        stageCount: 2,
        ruleCount: 3,
      }),
    ]);
  });

  it("returns null when trying to activate a missing version", async () => {
    mockedFindOne.mockReturnValueOnce(createQueryResult(null));

    const result = await activateWorkflowConfigVersion("loan_application", 99);

    expect(result).toBeNull();
    expect(mockedUpdateMany).not.toHaveBeenCalled();
    expect(mockedUpdateOne).not.toHaveBeenCalled();
  });

  it("skips seeding when the latest stored workflow already matches the registry", async () => {
    mockedFindOne.mockReturnValueOnce(
      createQueryResult({
        ...workflowRegistry.loan_application,
        version: 4,
        isActive: true,
      })
    );

    const result = await seedRegistryWorkflowConfigs({
      names: ["loan_application"],
    });

    expect(mockedCreate).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        name: "loan_application",
        version: 4,
        isActive: true,
        action: "skipped",
      },
    ]);
  });
});
