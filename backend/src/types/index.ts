// Type definitions for the exchange

export interface User {
  id: string;
  username: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthPayload {
  userId: string;
  username: string;
}

export interface EngineRequest {
  correlationId: string;
  responseQueue: string;
  type:
    | 'create_order'
    | 'get_depth'
    | 'get_user_balance'
    | 'get_order'
    | 'cancel_order';
  payload: Record<string, unknown>;
}

export interface EngineResponse {
  correlationId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface OrderRequest {
  type: 'limit' | 'market';
  side: 'buy' | 'sell';
  symbol: string;
  price?: number;
  qty: number;
}

export interface OrderResponse {
  orderId: string;
  status: 'open' | 'partially_filled' | 'filled' | 'cancelled';
  filledQty: number;
  remainingQty: number;
  fills: Fill[];
}

export interface Fill {
  fillId: string;
  orderId: string;
  matchedOrderId: string;
  price: number;
  qty: number;
  timestamp: number;
}

export interface DepthResponse {
  symbol: string;
  bids: { price: number; qty: number }[];
  asks: { price: number; qty: number }[];
}

export interface BalanceResponse {
  userId: string;
  balances: Record<string, number>;
}

export interface OrderStatusResponse {
  orderId: string;
  status: 'open' | 'partially_filled' | 'filled' | 'cancelled';
  type: 'limit' | 'market';
  side: 'buy' | 'sell';
  symbol: string;
  price?: number;
  qty: number;
  filledQty: number;
  remainingQty: number;
  fills: Fill[];
  createdAt: number;
}
