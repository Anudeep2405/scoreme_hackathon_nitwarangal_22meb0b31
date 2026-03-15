import mongoose from 'mongoose';
import { env } from '@/config/env';

const skipExternalServices = process.env.SKIP_TEST_SERVICES === 'true';

beforeAll(async () => {
  if (skipExternalServices) {
    return;
  }

  // Ensure we connect to a test database so we don't wipe dev
  // Hackathon shortcut: just use the dev database but a different collection maybe?
  // Let's just use the connection
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(env.MONGODB_URI);
  }
});

afterAll(async () => {
  const { closeRetryQueue } = await import('@/queues/retryQueue');
  await closeRetryQueue();

  if (!skipExternalServices) {
    await mongoose.connection.close();
    if (global._redisClient) {
      await global._redisClient.quit();
    }
  }
});
