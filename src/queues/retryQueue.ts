import Bull from "bull";
import type { Job, JobOptions, Queue } from "bull";
import { WorkflowEngine } from "@/services/workflowEngine";
import { Request } from "@/models/Request";
import { env } from "@/config/env";
import dbConnect from "@/lib/mongodb";
import logger from "@/lib/logger";

export type RetryPayload = {
  requestId: string;
};

type QueueAddOptions = {
  jobId?: string;
};

type RetryQueue = {
  add: (data: RetryPayload, options?: QueueAddOptions) => Promise<void>;
};

const RETRY_QUEUE_NAME = "workflow-request-retries";
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_DELAY_MS = 2000;
const JOB_HISTORY_LIMIT = 100;

declare global {
  var __workflowRetryQueue: Queue<RetryPayload> | undefined;
  var __workflowRetryQueueRegistered: boolean | undefined;
}

function createRetryJobOptions(options?: QueueAddOptions): JobOptions {
  return {
    jobId: options?.jobId,
    attempts: MAX_RETRY_ATTEMPTS,
    backoff: {
      type: "exponential",
      delay: RETRY_BACKOFF_DELAY_MS,
    },
    removeOnComplete: JOB_HISTORY_LIMIT,
    removeOnFail: JOB_HISTORY_LIMIT,
  };
}

async function handleRetryFailure(requestId: string, error: unknown) {
  logger.error(`Max retries reached for ${requestId}. Moving to manual_review.`, { error });

  try {
    await dbConnect();
    await Request.findOneAndUpdate(
      { requestId },
      {
        $set: {
          status: "manual_review",
          reasoning: "External dependency failed after 3 retries.",
        },
        $push: {
          history: {
            stage: "retry_queue",
            action: "Moved to manual review after retry queue exhaustion",
            timestamp: new Date(),
          },
          decisions: {
            stage: "retry_queue",
            decision: "manual_review",
            reasoning: "External dependency failed after 3 retries.",
          },
        },
      }
    );
  } catch (updateError) {
    logger.error(`Failed to update status to manual_review for ${requestId}`, { updateError });
  }
}

async function processRetry(requestId: string, attemptNumber: number) {
  logger.info(`Processing Bull retry queue for ${requestId}, attempt ${attemptNumber}`);
  await WorkflowEngine.processRequest(requestId);
}

function attachRetryQueueProcessor(queue: Queue<RetryPayload>) {
  if (global.__workflowRetryQueueRegistered) {
    return;
  }

  queue.process(async (job: Job<RetryPayload>) => {
    const attemptNumber = job.attemptsMade + 1;
    await processRetry(job.data.requestId, attemptNumber);
  });

  queue.on("completed", (job: Job<RetryPayload>) => {
    logger.info(`Retry queue completed for ${job.data.requestId}`, {
      attemptsMade: job.attemptsMade,
      jobId: job.id,
    });
  });

  queue.on("failed", async (job: Job<RetryPayload> | undefined, error: Error) => {
    if (!job) {
      logger.error("Retry queue job failed without job metadata", { error });
      return;
    }

    const maxAttempts = typeof job.opts.attempts === "number" ? job.opts.attempts : MAX_RETRY_ATTEMPTS;

    logger.error(`Retry queue attempt failed for ${job.data.requestId}`, {
      attemptsMade: job.attemptsMade,
      maxAttempts,
      error,
      jobId: job.id,
    });

    if (job.attemptsMade >= maxAttempts) {
      await handleRetryFailure(job.data.requestId, error);
    }
  });

  queue.on("error", (error: Error) => {
    logger.error("Retry queue infrastructure error", { error });
  });

  global.__workflowRetryQueueRegistered = true;
}

function getRetryQueueInstance(): Queue<RetryPayload> {
  if (!global.__workflowRetryQueue) {
    global.__workflowRetryQueue = new Bull<RetryPayload>(RETRY_QUEUE_NAME, env.REDIS_URL, {
      defaultJobOptions: createRetryJobOptions(),
    });
  }

  attachRetryQueueProcessor(global.__workflowRetryQueue);
  return global.__workflowRetryQueue;
}

async function addToRetryQueue(data: RetryPayload, options?: QueueAddOptions) {
  const queue = getRetryQueueInstance();
  await queue.isReady();

  if (options?.jobId) {
    const existingJob = await queue.getJob(options.jobId);
    if (existingJob) {
      logger.info(`Retry queue job already exists for ${data.requestId}`, {
        jobId: options.jobId,
        state: await existingJob.getState(),
      });
      return;
    }
  }

  await queue.add(data, createRetryJobOptions(options));
}

export async function closeRetryQueue() {
  const queue = global.__workflowRetryQueue;

  global.__workflowRetryQueue = undefined;
  global.__workflowRetryQueueRegistered = false;

  if (!queue) {
    return;
  }

  try {
    await queue.close();
  } catch (error) {
    logger.error("Failed to close retry queue", { error });
  }
}

export const retryQueue: RetryQueue = {
  add: addToRetryQueue,
};
