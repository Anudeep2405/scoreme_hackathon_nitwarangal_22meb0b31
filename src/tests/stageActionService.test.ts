import { WorkflowConfig } from "@/config/workflows";
import { getExternalScore } from "@/external/externalScore";
import { runStageActions } from "@/services/stageActionService";

jest.mock("@/external/externalScore", () => ({
  getExternalScore: jest.fn(),
}));

describe("stageActionService", () => {
  const mockedGetExternalScore = getExternalScore as jest.MockedFunction<typeof getExternalScore>;

  beforeEach(() => {
    mockedGetExternalScore.mockReset();
  });

  it("executes a configured external score action and maps fields dynamically", async () => {
    const config: WorkflowConfig = {
      name: "dynamic_scoring",
      stages: ["scoring"],
      stageActions: {
        scoring: [
          {
            id: "action-score-1",
            type: "fetch_external_score",
            targetField: "derived.external.score",
            processedFlagField: "meta.external_score_fetched",
            historyMessage: "Loaded external score",
          },
        ],
      },
      rules: {
        scoring: [],
      },
      transitions: [],
    };

    const requestState = {
      requestId: "req-123",
      input: {} as Record<string, unknown>,
      history: [] as Array<{ stage: string; action: string; timestamp: Date }>,
    };

    mockedGetExternalScore.mockResolvedValue({ score: 812 });

    await runStageActions("scoring", config, requestState);

    expect(mockedGetExternalScore).toHaveBeenCalledTimes(1);
    expect(requestState.input).toMatchObject({
      derived: {
        external: {
          score: 812,
        },
      },
      meta: {
        external_score_fetched: true,
      },
    });
    expect(requestState.history).toHaveLength(1);
    expect(requestState.history[0]).toMatchObject({
      stage: "scoring",
      action: "Loaded external score: 812",
    });
  });

  it("skips a configured action when the processed flag is already set", async () => {
    const config: WorkflowConfig = {
      name: "dynamic_scoring",
      stages: ["scoring"],
      stageActions: {
        scoring: [
          {
            id: "action-score-1",
            type: "fetch_external_score",
            targetField: "external_score",
            processedFlagField: "external_score_processed",
          },
        ],
      },
      rules: {
        scoring: [],
      },
      transitions: [],
    };

    const requestState = {
      requestId: "req-456",
      input: {
        external_score_processed: true,
      } as Record<string, unknown>,
      history: [] as Array<{ stage: string; action: string; timestamp: Date }>,
    };

    await runStageActions("scoring", config, requestState);

    expect(mockedGetExternalScore).not.toHaveBeenCalled();
    expect(requestState.history).toHaveLength(0);
  });
});
