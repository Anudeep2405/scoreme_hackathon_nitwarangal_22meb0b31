import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createWorkflowConfigVersion,
  getStoredWorkflowConfigRecord,
  listStoredWorkflowConfigs,
  parseWorkflowConfig,
  workflowConfigSchema,
} from "@/services/workflowConfigService";

const createWorkflowConfigRequestSchema = z.object({
  config: workflowConfigSchema,
  activate: z.boolean().optional().default(true),
});

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.trim();
  const versionParam = req.nextUrl.searchParams.get("version")?.trim();

  if (versionParam && !name) {
    return NextResponse.json(
      { error: "The 'name' query parameter is required when 'version' is provided" },
      { status: 400 }
    );
  }

  if (name && versionParam) {
    const parsedVersion = Number(versionParam);
    if (!Number.isInteger(parsedVersion) || parsedVersion < 1) {
      return NextResponse.json(
        { error: "The 'version' query parameter must be a positive integer" },
        { status: 400 }
      );
    }

    const item = await getStoredWorkflowConfigRecord(name, parsedVersion);
    if (!item) {
      return NextResponse.json({ error: "Workflow config not found" }, { status: 404 });
    }

    return NextResponse.json({ item }, { status: 200 });
  }

  const items = await listStoredWorkflowConfigs(name);
  return NextResponse.json({ items }, { status: 200 });
}

export async function POST(req: NextRequest) {
  let body;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createWorkflowConfigRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation Error", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const normalizedConfig = parseWorkflowConfig(parsed.data.config, "api:create-workflow-config");
  if (!normalizedConfig) {
    return NextResponse.json(
      { error: "Validation Error", details: "Workflow config could not be normalized" },
      { status: 400 }
    );
  }

  const item = await createWorkflowConfigVersion(normalizedConfig, {
    activate: parsed.data.activate,
  });

  if (!item) {
    return NextResponse.json(
      { error: "Failed to create workflow config version" },
      { status: 500 }
    );
  }

  return NextResponse.json({ item }, { status: 201 });
}
