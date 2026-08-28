import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { authRouter } from './routes/auth-routes.js';
import { orderRouter } from './routes/order-routes.js';
import { errorHandler } from './middleware/error.js';

const PORT = parseInt(process.env.PORT || '3000');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Logging - using 'dev' for now, switch to 'combined' in prod
app.use(morgan('dev'));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes - Auth routes should not require auth middleware
app.use('/api/v1/auth', authRouter);

// Protected routes
app.use('/api/v1', orderRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler (must be last)
app.use(errorHandler);

// Start server
// TODO: Add graceful shutdown handling
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

export default app;
