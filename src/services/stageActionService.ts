import { StageAction, WorkflowConfig } from "@/config/workflows";
import { getExternalScore } from "@/external/externalScore";
import { getValueAtPath, setValueAtPath } from "@/lib/objectPath";
import logger from "@/lib/logger";

interface StageActionRequestState {
  requestId: string;
  input: Record<string, unknown>;
  history: Array<{
    stage: string;
    action: string;
    timestamp: Date;
  }>;
}

function getProcessedFlagField(action: Extract<StageAction, { type: "fetch_external_score" }>) {
  return action.processedFlagField ?? `${action.targetField}_processed`;
}

async function executeFetchExternalScoreAction(
  action: Extract<StageAction, { type: "fetch_external_score" }>,
  stage: string,
  request: StageActionRequestState
) {
  const processedFlagField = getProcessedFlagField(action);
  const alreadyProcessed = getValueAtPath(request.input, processedFlagField);

  if (alreadyProcessed) {
    return;
  }

  try {
    const { score } = await getExternalScore();
    setValueAtPath(request.input, action.targetField, score);
    setValueAtPath(request.input, processedFlagField, true);

    request.history.push({
      stage,
      action: action.historyMessage ? `${action.historyMessage}: ${score}` : `Fetched external score: ${score}`,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error(`Stage action ${action.id} failed for request ${request.requestId}`, {
      error,
      stage,
      actionType: action.type,
    });
    throw error;
  }
}

export async function runStageActions(
  stage: string,
  config: WorkflowConfig,
  request: StageActionRequestState
) {
  const actions = config.stageActions?.[stage] ?? [];

  for (const action of actions) {
    switch (action.type) {
      case "fetch_external_score":
        await executeFetchExternalScoreAction(action, stage, request);
        break;
    }
  }
}
