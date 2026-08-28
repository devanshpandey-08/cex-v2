import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { EngineRequest, EngineResponse } from '../types/index.js';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const BACKEND_QUEUE_ID = process.env.BACKEND_QUEUE_ID || 'backend-1';
const ENGINE_QUEUE = 'backend-to-engine-broker';
const RESPONSE_QUEUE = `response-queue-${BACKEND_QUEUE_ID}`;

export class EngineClient {
  private static instance: EngineClient;
  private redis: Redis;
  private pendingResponses: Map<string, {
    resolve: (response: EngineResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>;

  private constructor() {
    this.redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      maxRetriesPerRequest: null,
    });

    this.pendingResponses = new Map();
    this.setupResponseListener();
  }

  public static getInstance(): EngineClient {
    if (!EngineClient.instance) {
      EngineClient.instance = new EngineClient();
    }
    return EngineClient.instance;
  }

  private setupResponseListener(): void {
    const subscriber = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      maxRetriesPerRequest: null,
    });

    subscriber.subscribe(RESPONSE_QUEUE, (err, count) => {
      if (err) {
        console.error('Failed to subscribe to response queue:', err);
      } else {
        console.log(`Subscribed to ${RESPONSE_QUEUE}`);
      }
    });

    subscriber.on('message', (channel, message) => {
      if (channel === RESPONSE_QUEUE) {
        try {
          const response: EngineResponse = JSON.parse(message);
          const pending = this.pendingResponses.get(response.correlationId);

          if (pending) {
            clearTimeout(pending.timeout);
            pending.resolve(response);
            this.pendingResponses.delete(response.correlationId);
          }
        } catch (error) {
          console.error('Error parsing engine response:', error);
        }
      }
    });
  }

  public async sendCommand(
    type: EngineRequest['type'],
    payload: Record<string, unknown>
  ): Promise<EngineResponse> {
    const correlationId = uuidv4();

    const request: EngineRequest = {
      correlationId,
      responseQueue: RESPONSE_QUEUE,
      type,
      payload,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(correlationId);
        reject(new Error('Engine request timeout'));
      }, 10000); // 10 second timeout

      this.pendingResponses.set(correlationId, { resolve, reject, timeout });

      this.redis
        .publish(ENGINE_QUEUE, JSON.stringify(request))
        .catch((err) => {
          clearTimeout(timeout);
          this.pendingResponses.delete(correlationId);
          reject(err);
        });
    });
  }

  public async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}

// Helper function for direct usage in routes
export async function sendToEngine(
  type: EngineRequest['type'],
  payload: Record<string, unknown>
): Promise<EngineResponse> {
  const client = EngineClient.getInstance();
  return client.sendCommand(type, payload);
}
