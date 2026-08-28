import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  createOrder,
  getOrder,
  cancelOrder,
  getDepth,
  getBalance,
} from '../controllers/order-controller.js';

export const orderRouter = Router();

// All order routes require authentication
orderRouter.use(authMiddleware);

orderRouter.post('/order', createOrder);
orderRouter.get('/order/:orderId', getOrder);
orderRouter.delete('/order/:orderId', cancelOrder);
orderRouter.get('/depth/:symbol', getDepth);
orderRouter.get('/balance', getBalance);

// Admin endpoint to seed balances (for testing only - remove in prod)
// TODO: Move to separate admin router with stricter auth
orderRouter.post('/admin/seed-balance', async (req, res) => {
  try {
    const { userId, balances } = req.body;
    
    if (!userId || !balances) {
      return res.status(400).json({ error: 'userId and balances required' });
    }
    
    // Send message to engine to update balance
    const { EngineClient } = await import('../utils/engine-client.js');
    const client = EngineClient.getInstance();
    
    const response = await client.sendCommand('seed_balance', { userId, balances });
    
    if (response.ok) {
      res.json({ message: 'Balance seeded', data: response.data });
    } else {
      res.status(400).json({ error: response.error });
    }
  } catch (error) {
    console.error('Seed balance error:', error);
    res.status(500).json({ error: 'Failed to seed balance' });
  }
});
