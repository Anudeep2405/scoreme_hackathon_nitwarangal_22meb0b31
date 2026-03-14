import Redis from "ioredis";
import { env } from "@/config/env";

let redisClient: Redis;

declare global {
  var _redisClient: Redis | undefined;
}

if (!global._redisClient) {
  global._redisClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
}

redisClient = global._redisClient;

export default redisClient;
