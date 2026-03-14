import { NextRequest, NextResponse } from "next/server";
import { Request as RequestModel } from "@/models/Request";
import dbConnect from "@/lib/mongodb";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await dbConnect();
    
    // In Next.js App Router (v15+), params is a Promise.
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const requestDoc = await RequestModel.findOne({ requestId: id });

    if (!requestDoc) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    return NextResponse.json({
      requestId: requestDoc.requestId,
      workflowName: requestDoc.workflowName,
      input: requestDoc.input,
      currentStage: requestDoc.currentStage,
      status: requestDoc.status,
      rulesTriggered: requestDoc.rulesTriggered,
      decisions: requestDoc.decisions,
      history: requestDoc.history,
      reasoning: requestDoc.reasoning,
    }, { status: 200 });
    
  } catch (error: any) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
