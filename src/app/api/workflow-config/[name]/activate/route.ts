import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { activateWorkflowConfigVersion } from "@/services/workflowConfigService";

const activateWorkflowConfigRequestSchema = z.object({
  version: z.number().int().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  let body;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsedBody = activateWorkflowConfigRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Validation Error", details: parsedBody.error.format() },
      { status: 400 }
    );
  }

  const { name } = await params;
  const item = await activateWorkflowConfigVersion(name, parsedBody.data.version);

  if (!item) {
    return NextResponse.json({ error: "Workflow config not found" }, { status: 404 });
  }

  return NextResponse.json({ item }, { status: 200 });
}
