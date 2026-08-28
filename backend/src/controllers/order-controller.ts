import { Request, Response } from 'express';
import { prisma } from '../db.js';
import { orderSchema } from '../utils/validators.js';
import { EngineClient } from '../utils/engine-client.js';
import { OrderRequest, OrderResponse } from '../types/index.js';

export async function createOrder(req: Request, res: Response): Promise<void> {
  try {
    const validation = orderSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
      return;
    }

    const orderData: OrderRequest = validation.data;

    // Validate limit orders require price
    if (orderData.type === 'limit' && !orderData.price) {
      res.status(400).json({ error: 'Price is required for limit orders' });
      return;
    }

    const userId = req.user!.userId;
    
    // Get idempotency key from header
    const requestId = req.headers['x-request-id'] as string | undefined;

    // Send to engine via Redis
    const engineClient = EngineClient.getInstance();
    const response = await engineClient.sendCommand('create_order', {
      userId,
      requestId,
      ...orderData,
    });

    if (!response.ok) {
      res.status(400).json({ error: response.error });
      return;
    }

    res.status(201).json(response.data);
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getOrder(req: Request, res: Response): Promise<void> {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      res.status(400).json({ error: 'Order ID is required' });
      return;
    }

    const engineClient = EngineClient.getInstance();
    const response = await engineClient.sendCommand('get_order', { orderId });

    if (!response.ok) {
      res.status(404).json({ error: response.error });
      return;
    }

    res.json(response.data);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function cancelOrder(req: Request, res: Response): Promise<void> {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      res.status(400).json({ error: 'Order ID is required' });
      return;
    }

    const engineClient = EngineClient.getInstance();
    const response = await engineClient.sendCommand('cancel_order', { orderId });

    if (!response.ok) {
      res.status(400).json({ error: response.error });
      return;
    }

    res.json(response.data);
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getDepth(req: Request, res: Response): Promise<void> {
  try {
    const { symbol } = req.params;

    if (!symbol) {
      res.status(400).json({ error: 'Symbol is required' });
      return;
    }

    const engineClient = EngineClient.getInstance();
    const response = await engineClient.sendCommand('get_depth', { symbol });

    if (!response.ok) {
      res.status(400).json({ error: response.error });
      return;
    }

    res.json(response.data);
  } catch (error) {
    console.error('Get depth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getBalance(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;

    const engineClient = EngineClient.getInstance();
    const response = await engineClient.sendCommand('get_user_balance', {
      userId,
    });

    if (!response.ok) {
      res.status(400).json({ error: response.error });
      return;
    }

    res.json(response.data);
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
