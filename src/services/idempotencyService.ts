import redisClient from "@/lib/redis";
import logger from "@/lib/logger";

const TTL_SECONDS = 86400; // 24 hours

export async function checkIdempotency(key: string): Promise<any | null> {
  try {
    const cached = await redisClient.get(`idempotency:${key}`);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    logger.error("Error reading from Redis cache", { error, key });
  }
  return null;
}

export async function setIdempotency(key: string, response: any): Promise<void> {
  try {
    await redisClient.setex(`idempotency:${key}`, TTL_SECONDS, JSON.stringify(response));
  } catch (error) {
    logger.error("Error writing to Redis cache", { error, key });
  }
}
