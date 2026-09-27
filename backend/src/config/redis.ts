import Redis from 'ioredis';
import { env } from './env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  // Fail fast on initial connect so a misconfigured REDIS_URL surfaces at
  // boot instead of hanging every queue operation later.
  lazyConnect: false,
});

redis.on('error', (err) => {
  console.error('Redis client error:', err.message);
});

export async function checkRedisConnection(): Promise<void> {
  await redis.ping();
}
