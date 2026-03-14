import mongoose from 'mongoose';
import redisClient from '@/lib/redis';
import { env } from '@/config/env';

beforeAll(async () => {
  // Ensure we connect to a test database so we don't wipe dev
  // Hackathon shortcut: just use the dev database but a different collection maybe?
  // Let's just use the connection
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(env.MONGODB_URI);
  }
});

afterAll(async () => {
  await mongoose.connection.close();
  redisClient.quit();
});
