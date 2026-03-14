import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().url().default("mongodb://localhost:27017/workflow_platform_dev"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment variables:", parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsedEnv.data;
