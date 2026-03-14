import { workflowRegistry, WorkflowConfig, Rule } from "@/config/workflows";
import { Request, IRequest } from "@/models/Request";
import { evaluateRule } from "./ruleEvaluator";
import { logAuditEvent } from "./auditService";
import { getExternalScore } from "@/external/externalScore";
import dbConnect from "@/lib/mongodb";
import logger from "@/lib/logger";

export class WorkflowEngine {
  
  static async processRequest(requestId: string): Promise<IRequest> {
    await dbConnect();
    
    // 1. Fetch Request
    const req = await Request.findOne({ requestId });
    if (!req) throw new Error(`Request ${requestId} not found`);
    
    // If already in terminal state, do not process
    if (["approved", "rejected", "error", "manual_review"].includes(req.status)) {
      return req;
    }

    // 2. Fetch Config
    const config = workflowRegistry[req.workflowName];
    if (!config) throw new Error(`Workflow config ${req.workflowName} not found`);

    // We process synchronously block by block, moving through stages until a terminal state
    // For a hackathon, we can advance through stages in a loop until we need to stop.
    let loopCount = 0;
    while (req.status === "processing" && loopCount < 10) {
      loopCount++;
      const currentStage = req.currentStage;
      logger.info(`Engine processing stage: ${currentStage} for request ${requestId}`);

      // Optional: Pre-stage hooks (e.g. fetching external score)
      if (currentStage === "scoring" && !req.input.external_score_processed) {
        try {
          const { score } = await getExternalScore();
          req.input.external_score = score;
          req.input.external_score_processed = true;
          
          req.history.push({
            stage: currentStage,
            action: `Fetched external score: ${score}`,
            timestamp: new Date()
          });
        } catch (error) {
          logger.error(`Failed to fetch external score for request ${requestId}`, { error });
          // Rethrow to let API or Bull-queue catch it (Triggering failure retry mechanism)
          throw error; 
        }
      }

      // Evaluate rules for current stage
      const rules = config.rules[currentStage] || [];
      let stageFailed = false;
      let branchToStage: string | null = null;
      let branchToStatus: string | null = null;
      
      for (const rule of rules) {
        const result = evaluateRule(rule, req.input);
        
        // Log to Winston and MongoDB
        await logAuditEvent({
          requestId: req.requestId,
          stage: currentStage,
          ruleType: rule.type,
          field: rule.field,
          result: result.passed ? "pass" : "fail",
          details: `Expected: ${result.expected}, Actual: ${result.actual}`
        });
        
        req.rulesTriggered.push({
          ruleId: rule.id,
          passed: result.passed,
          details: `Type: ${rule.type}`
        });

        if (rule.type === "conditional") {
          const next = result.passed ? rule.onPass : rule.onFail;
          if (next) {
            // Next can be a stage like 'decision' or a status like 'rejected_status'
            if (next.endsWith("_status")) {
              branchToStatus = next.replace("_status", "");
            } else {
              branchToStage = next;
            }
            break; // Stop evaluating rules in this stage after branch
          }
        } 
        else if (!result.passed) {
          stageFailed = true;
          break; // Stop evaluating remaining rules in this stage on first failure
        }
      }

      // Transitions
      if (branchToStatus) {
        req.status = branchToStatus as any;
        req.reasoning = `Branched to status ${branchToStatus} in stage ${currentStage}`;
        req.decisions.push({ stage: currentStage, decision: branchToStatus, reasoning: req.reasoning });
      } else if (branchToStage) {
        req.currentStage = branchToStage;
        req.history.push({ stage: currentStage, action: `Transitioned to ${branchToStage}`, timestamp: new Date() });
        req.decisions.push({ stage: currentStage, decision: `move to ${branchToStage}` });
      } else {
        // Linear transition based on config.transitions
        const transition = config.transitions.find(t => t.from === currentStage && (t.condition === "on_success" ? !stageFailed : true));
        
        if (transition && !stageFailed) {
          req.currentStage = transition.to;
          req.history.push({ stage: currentStage, action: `Transitioned to ${transition.to}`, timestamp: new Date() });
          req.decisions.push({ stage: currentStage, decision: `move to ${transition.to}` });
        } else {
          // If no transition found, or stage failed linearly without explicit branch
          // E.g. Intake rules failed -> reject
          if (stageFailed) {
            req.status = "rejected";
            req.reasoning = `Failed at stage ${currentStage}`;
            req.decisions.push({ stage: currentStage, decision: "rejected", reasoning: "Rule failure" });
          } else {
            // Reached end of workflow
            req.status = "approved";
            req.reasoning = `Completed all stages`;
            req.decisions.push({ stage: currentStage, decision: "approved", reasoning: "End of workflow" });
          }
        }
      }

      // Mark modified explicitly since input is Mixed type
      req.markModified('input');
      req.markModified('history');
      req.markModified('rulesTriggered');
      req.markModified('decisions');
      await req.save();
    }

    return req;
  }
}
