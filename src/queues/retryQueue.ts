import Queue from "bull";
import { env } from "@/config/env";
import { WorkflowEngine } from "@/services/workflowEngine";
import { Request } from "@/models/Request";
import logger from "@/lib/logger";

export const retryQueue = new Queue("workflow-retry", env.REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
  },
});

retryQueue.process(async (job) => {
  const { requestId } = job.data;
  logger.info(`Processing retry queue for ${requestId}, attempt ${job.attemptsMade + 1}`);

  try {
    await WorkflowEngine.processRequest(requestId);
  } catch (error) {
    logger.error(`Retry attempt failed for ${requestId}`, { error });
    throw error; // Will trigger Bull's retry mechanism
  }
});

retryQueue.on("failed", async (job, err) => {
  if (job.attemptsMade >= Number(job.opts.attempts)) {
    const { requestId } = job.data;
    logger.error(`Max retries reached for ${requestId}. Moving to manual_review.`, { err });

    try {
      await Request.findOneAndUpdate(
        { requestId },
        { 
          status: "manual_review", 
          reasoning: "External dependency failed after 3 retries." 
        }
      );
    } catch (e) {
      logger.error(`Failed to update status to manual_review for ${requestId}`, { e });
    }
  }
});
