import { WorkflowEngine } from "@/services/workflowEngine";
import { Request } from "@/models/Request";
import logger from "@/lib/logger";

type RetryPayload = {
  requestId: string;
};

type QueueAddOptions = {
  jobId?: string;
};

type RetryQueue = {
  add: (data: RetryPayload, options?: QueueAddOptions) => Promise<void>;
};

async function handleRetryFailure(requestId: string, error: unknown) {
  logger.error(`Max retries reached for ${requestId}. Moving to manual_review.`, { error });

  try {
    await Request.findOneAndUpdate(
      { requestId },
      {
        status: "manual_review",
        reasoning: "External dependency failed after 3 retries.",
      }
    );
  } catch (updateError) {
    logger.error(`Failed to update status to manual_review for ${requestId}`, { updateError });
  }
}

async function processRetry(requestId: string, attemptsMade: number) {
  logger.info(`Processing retry queue for ${requestId}, attempt ${attemptsMade}`);
  await WorkflowEngine.processRequest(requestId);
}

function createInProcessRetryQueue(): RetryQueue {
  return {
    async add(data: RetryPayload, options?: QueueAddOptions) {
      logger.warn("Using in-process retry queue implementation.", { requestId: data.requestId, options });

      let lastError: unknown;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await processRetry(data.requestId, attempt);
          return;
        } catch (error) {
          lastError = error;
          logger.error(`Inline retry attempt failed for ${data.requestId}`, { attempt, error });

          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
          }
        }
      }

      await handleRetryFailure(data.requestId, lastError);
      throw lastError;
    },
  };
};

export const retryQueue: RetryQueue = createInProcessRetryQueue();
