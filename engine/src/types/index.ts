// Engine type definitions

export interface OrderRecord {
  orderId: string;
  userId: string;
  type: 'limit' | 'market';
  side: 'buy' | 'sell';
  symbol: string;
  price?: number;
  qty: number;
  filledQty: number;
  remainingQty: number;
  status: 'open' | 'partially_filled' | 'filled' | 'cancelled';
  fills: Fill[];
  createdAt: number;
}

export interface Fill {
  fillId: string;
  orderId: string;
  matchedOrderId: string;
  price: number;
  qty: number;
  timestamp: number;
}

export interface OrderBook {
  symbol: string;
  bids: Map<number, OrderLevel>; // price -> order level (sorted high to low)
  asks: Map<number, OrderLevel>; // price -> order level (sorted low to high)
}

export interface OrderLevel {
  price: number;
  orders: string[]; // order IDs at this price level
  totalQty: number;
}

export interface Balance {
  userId: string;
  balances: Record<string, number>;
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
