import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app';
import { checkDbConnection } from './config/db';
import { env } from './config/env';
import { checkRedisConnection } from './config/redis';
import { setupMatchmakingGateway } from './modules/matchmaking/matchmaking.gateway';
import { startTokenTicker } from './modules/matchmaking/tokenTicker';

async function main(): Promise<void> {
  await checkDbConnection();
  console.log('Database connection verified.');

  await checkRedisConnection();
  console.log('Redis connection verified.');

  const app = createApp();
  const httpServer = http.createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.CORS_ORIGIN },
  });

  setupMatchmakingGateway(io);
  const ticker = startTokenTicker(io);

  httpServer.listen(env.PORT, () => {
    console.log(`Server listening on port ${env.PORT} [${env.NODE_ENV}]`);
    console.log(
      `Token ticker running every ${env.TOKEN_TICK_INTERVAL_SECONDS}s ` +
        `(text=${env.TEXT_CHAT_TOKENS_PER_MIN}/min, voice=${env.VOICE_CALL_TOKENS_PER_MIN}/min, video=${env.VIDEO_CALL_TOKENS_PER_MIN}/min)`
    );
  });

  const shutdown = () => {
    clearInterval(ticker);
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
