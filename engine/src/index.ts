import Redis from 'ioredis';
import { EngineRequest, EngineResponse } from './types/index.js';
import {
  createOrder,
  getOrder,
  cancelOrder,
  getDepth,
  getUserBalance,
} from './store/matching-engine.js';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const ENGINE_QUEUE = process.env.ENGINE_QUEUE || 'backend-to-engine-broker';

async function main() {
  console.log('Starting exchange engine...');

  const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: null,
  });

  redis.on('connect', () => {
    console.log('Connected to Redis');
  });

  redis.on('error', (err) => {
    console.error('Redis error:', err);
  });

  // Subscribe to engine queue
  const subscriber = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: null,
  });

  subscriber.subscribe(ENGINE_QUEUE, (err, count) => {
    if (err) {
      console.error('Failed to subscribe to engine queue:', err);
    } else {
      console.log(`Subscribed to ${ENGINE_QUEUE}`);
      console.log('Engine is ready to process orders');
    }
  });

  // Process messages
  subscriber.on('message', async (channel, message) => {
    if (channel !== ENGINE_QUEUE) return;

    try {
      const request: EngineRequest = JSON.parse(message);
      console.log(`Processing request: ${request.type} (correlationId: ${request.correlationId})`);

      let response: EngineResponse;

      switch (request.type) {
        case 'create_order':
          response = createOrder(request.payload);
          break;
        case 'get_order':
          response = getOrder(request.payload);
          break;
        case 'cancel_order':
          response = cancelOrder(request.payload);
          break;
        case 'get_depth':
          response = getDepth(request.payload);
          break;
        case 'get_user_balance':
          response = getUserBalance(request.payload);
          break;
        case 'seed_balance':
          // Admin-only: manually set user balance (for testing)
          const { seedUserBalance } = await import('./store/exchange-store.js');
          response = seedUserBalance(request.payload);
          break;
        default:
          response = {
            correlationId: request.correlationId,
            ok: false,
            error: `Unknown request type: ${request.type}`,
          };
      }

      // Set the correlationId in response
      response.correlationId = request.correlationId;

      // Publish response to backend's response queue
      await redis.publish(request.responseQueue, JSON.stringify(response));
      console.log(`Response sent for correlationId: ${request.correlationId}`);
    } catch (error) {
      console.error('Error processing message:', error);
      
      // Send error response
      const errorResponse: EngineResponse = {
        correlationId: 'unknown',
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      
      try {
        const request: EngineRequest = JSON.parse(message);
        errorResponse.correlationId = request.correlationId;
        await redis.publish(request.responseQueue, JSON.stringify(errorResponse));
      } catch {
        // Can't parse request, just log
      }
    }
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down engine...');
    await subscriber.quit();
    await redis.quit();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down engine...');
    await subscriber.quit();
    await redis.quit();
    process.exit(0);
  });
}

main().catch(console.error);
