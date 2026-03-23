import 'dotenv/config';
import { env } from './config/env';
import { pool } from './db';
import { api } from './http/api';
import { logger } from './logger';

const app = api();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Server started');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received');

  server.close(async () => {
    await pool.end();
    logger.info('Server and DB pool closed — exiting');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
