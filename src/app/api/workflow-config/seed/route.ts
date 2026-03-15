import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { workflowRegistry } from "@/config/workflows";
import { seedRegistryWorkflowConfigs } from "@/services/workflowConfigService";

const seedWorkflowConfigsRequestSchema = z.object({
  names: z.array(z.string().min(1)).optional(),
  activate: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest) {
  const bodyText = await req.text();
  let body: unknown = {};

  if (bodyText.trim().length > 0) {
    try {
      body = JSON.parse(bodyText);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  const parsed = seedWorkflowConfigsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation Error", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const names = parsed.data.names ?? Object.keys(workflowRegistry);
  const unknownNames = names.filter((name) => !workflowRegistry[name]);

  if (unknownNames.length > 0) {
    return NextResponse.json(
      {
        error: "Unknown workflow names requested for seeding",
        details: unknownNames,
      },
      { status: 400 }
    );
  }

  const items = await seedRegistryWorkflowConfigs({
    names,
    activate: parsed.data.activate,
  });

  return NextResponse.json({ items }, { status: 200 });
}
