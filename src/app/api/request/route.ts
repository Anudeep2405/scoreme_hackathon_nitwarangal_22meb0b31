import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { checkIdempotency, setIdempotency } from "@/services/idempotencyService";
import { WorkflowEngine } from "@/services/workflowEngine";
import { Request as RequestModel } from "@/models/Request";
import { retryQueue } from "@/queues/retryQueue";
import { workflowRegistry } from "@/config/workflows";
import dbConnect from "@/lib/mongodb";
import logger from "@/lib/logger";

const requestSchema = z.object({
  workflowName: z.string().min(1),
  inputData: z.record(z.string(), z.any()),
  idempotencyKey: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    
    // Parse body
    const bodyText = await req.text();
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Validate with Zod
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation Error", details: parsed.error.format() }, { status: 400 });
    }

    const { workflowName, inputData, idempotencyKey } = parsed.data;

    // Validate Workflow Configuration Exists
    const config = workflowRegistry[workflowName];
    if (!config) {
      return NextResponse.json({ error: `Workflow '${workflowName}' not found` }, { status: 400 });
    }

    // Check Idempotency
    const cachedResponse = await checkIdempotency(idempotencyKey);
    if (cachedResponse) {
      logger.info(`Idempotency hit for key ${idempotencyKey}`);
      return NextResponse.json(cachedResponse, { status: 200 }); // Same as before!
    }

    // Create Initial DB Entry
    const requestId = crypto.randomUUID();
    const initialStage = config.stages[0]; // Usually "intake"
    
    await RequestModel.create({
      requestId,
      idempotencyKey,
      workflowName,
      input: inputData,
      currentStage: initialStage,
      status: "processing",
    });

    // Run engine
    try {
      const result = await WorkflowEngine.processRequest(requestId);
      
      const responseBody = {
        requestId: result.requestId,
        status: result.status,
        currentStage: result.currentStage,
      };

      // Cache the result
      await setIdempotency(idempotencyKey, responseBody);

      return NextResponse.json(responseBody, { status: result.status === "error" ? 500 : 200 });
    } catch (engineError: any) {
      logger.error(`Engine failed synchronously for ${requestId}`, { engineError });
      
      // Add to retry queue if external dependency failed
      if (engineError.message === "External service unavailable") {
        await retryQueue.add({ requestId }, { jobId: requestId });
        
        const responseBody = {
          requestId,
          status: "processing",
          message: "Request queued for retry due to external dependency failure"
        };
        // Don't set idempotency yet, or set it to processing so duplicates also get processing
        await setIdempotency(idempotencyKey, responseBody);
        
        return NextResponse.json(responseBody, { status: 202 }); // Accepted
      }
      
      return NextResponse.json({ error: "Internal Workflow Error", details: engineError.message }, { status: 500 });
    }

  } catch (error: any) {
    logger.error("API error in POST /api/request", { error });
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
