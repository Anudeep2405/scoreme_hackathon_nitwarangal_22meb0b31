type MockQueue = {
  add: jest.Mock;
  close: jest.Mock;
  getJob: jest.Mock;
  isReady: jest.Mock;
  on: jest.Mock;
  process: jest.Mock;
};

type MockJob = {
  attemptsMade: number;
  data: {
    requestId: string;
  };
  id: string;
  opts: {
    attempts?: number;
  };
};

const queueHandlers: Record<string, ((...args: unknown[]) => unknown) | undefined> = {};

const mockQueue: MockQueue = {
  add: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
  getJob: jest.fn().mockResolvedValue(null),
  isReady: jest.fn().mockResolvedValue(undefined),
  on: jest.fn((event: string, handler: (...args: unknown[]) => unknown) => {
    queueHandlers[event] = handler;
    return mockQueue;
  }),
  process: jest.fn(),
};

const BullMock = jest.fn(() => mockQueue);

jest.mock("bull", () => ({
  __esModule: true,
  default: BullMock,
}));

jest.mock("@/services/workflowEngine", () => ({
  WorkflowEngine: {
    processRequest: jest.fn(),
  },
}));

jest.mock("@/models/Request", () => ({
  Request: {
    findOneAndUpdate: jest.fn(),
  },
}));

jest.mock("@/lib/mongodb", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

describe("retryQueue", () => {
  beforeEach(() => {
    jest.resetModules();
    BullMock.mockClear();
    mockQueue.add.mockReset();
    mockQueue.close.mockResolvedValue(undefined);
    mockQueue.getJob.mockResolvedValue(null);
    mockQueue.isReady.mockResolvedValue(undefined);
    mockQueue.on.mockClear();
    mockQueue.process.mockClear();
    for (const key of Object.keys(queueHandlers)) {
      delete queueHandlers[key];
    }
    delete global.__workflowRetryQueue;
    delete global.__workflowRetryQueueRegistered;
  });

  it("enqueues Bull jobs with Redis-backed retry options", async () => {
    const { retryQueue } = await import("@/queues/retryQueue");

    await retryQueue.add({ requestId: "request-1" }, { jobId: "request-1" });

    expect(BullMock).toHaveBeenCalledWith(
      "workflow-request-retries",
      expect.any(String),
      expect.objectContaining({
        defaultJobOptions: expect.objectContaining({
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
          removeOnComplete: 100,
          removeOnFail: 100,
        }),
      })
    );

    expect(mockQueue.add).toHaveBeenCalledWith(
      { requestId: "request-1" },
      expect.objectContaining({
        jobId: "request-1",
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 100,
      })
    );
  });

  it("does not enqueue a duplicate Bull job when the job id already exists", async () => {
    mockQueue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue("waiting"),
    });

    const { retryQueue } = await import("@/queues/retryQueue");

    await retryQueue.add({ requestId: "request-2" }, { jobId: "request-2" });

    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it("runs the queue processor through WorkflowEngine", async () => {
    const { WorkflowEngine } = await import("@/services/workflowEngine");
    const { retryQueue } = await import("@/queues/retryQueue");

    await retryQueue.add({ requestId: "request-3" }, { jobId: "request-3" });

    const processHandler = mockQueue.process.mock.calls[0]?.[0] as
      | ((job: MockJob) => Promise<void>)
      | undefined;

    expect(processHandler).toBeDefined();

    await processHandler?.({
      attemptsMade: 1,
      data: { requestId: "request-3" },
      id: "request-3",
      opts: { attempts: 3 },
    });

    expect(WorkflowEngine.processRequest).toHaveBeenCalledWith("request-3");
  });

  it("moves the request to manual_review after the final Bull failure", async () => {
    const dbConnect = (await import("@/lib/mongodb")).default as jest.Mock;
    const { Request } = await import("@/models/Request");
    const { retryQueue } = await import("@/queues/retryQueue");

    await retryQueue.add({ requestId: "request-4" }, { jobId: "request-4" });

    const failedHandler = queueHandlers.failed as
      | ((job: MockJob, error: Error) => Promise<void>)
      | undefined;

    expect(failedHandler).toBeDefined();

    await failedHandler?.(
      {
        attemptsMade: 3,
        data: { requestId: "request-4" },
        id: "request-4",
        opts: { attempts: 3 },
      },
      new Error("External service unavailable")
    );

    expect(dbConnect).toHaveBeenCalled();
    expect(Request.findOneAndUpdate).toHaveBeenCalledWith(
      { requestId: "request-4" },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "manual_review",
        }),
      })
    );
  });
});
