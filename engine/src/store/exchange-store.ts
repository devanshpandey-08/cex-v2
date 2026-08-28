import { OrderBook, OrderLevel, OrderRecord, Fill, Balance } from '../types/index.js';

// In-memory order books by symbol
export const ORDERBOOKS = new Map<string, OrderBook>();

// All orders by ID
export const ORDERS = new Map<string, OrderRecord>();

// All fills (for history)
export const FILLS: Fill[] = [];

// User balances by userId
export const BALANCES = new Map<string, Balance>();

// Track processed idempotency keys to prevent duplicates
export const PROCESSED_REQUESTS = new Map<string, string>(); // requestId -> orderId

// Helper to get or create order book for a symbol
export function getOrderBook(symbol: string): OrderBook {
  let book = ORDERBOOKS.get(symbol);
  if (!book) {
    book = {
      symbol,
      bids: new Map(),
      asks: new Map(),
    };
    ORDERBOOKS.set(symbol, book);
  }
  return book;
}

// Helper to get or create balance for a user
// ONLY seed balances when explicitly requested, not on first sight
export function getBalance(userId: string, seed: boolean = false): Balance {
  let balance = BALANCES.get(userId);
  if (!balance) {
    balance = {
      userId,
      balances: {},
    };
    
    // Only seed if explicitly requested (e.g., for testing)
    if (seed) {
      balance.balances = {
        USD: 100000,
        BTC: 10,
        ETH: 100,
      };
    }
    
    BALANCES.set(userId, balance);
  }
  return balance;
}

// Add order to order book
export function addOrderToBook(order: OrderRecord): void {
  if (order.status !== 'open' && order.status !== 'partially_filled') {
    return;
  }

  const book = getOrderBook(order.symbol);
  const price = order.price!;
  
  if (order.side === 'buy') {
    let level = book.bids.get(price);
    if (!level) {
      level = { price, orders: [], totalQty: 0 };
      book.bids.set(price, level);
    }
    level.orders.push(order.orderId);
    level.totalQty += order.remainingQty;
  } else {
    let level = book.asks.get(price);
    if (!level) {
      level = { price, orders: [], totalQty: 0 };
      book.asks.set(price, level);
    }
    level.orders.push(order.orderId);
    level.totalQty += order.remainingQty;
  }
}

// Remove order from order book
export function removeOrderFromBook(order: OrderRecord): void {
  const book = ORDERBOOKS.get(order.symbol);
  if (!book) return;

  const price = order.price!;
  const levels = order.side === 'buy' ? book.bids : book.asks;
  const level = levels.get(price);

  if (level) {
    level.orders = level.orders.filter(id => id !== order.orderId);
    level.totalQty -= order.remainingQty;
    
    if (level.orders.length === 0) {
      levels.delete(price);
    }
  }
}

// Get sorted bid prices (highest first)
export function getSortedBidPrices(book: OrderBook): number[] {
  return Array.from(book.bids.keys()).sort((a, b) => b - a);
}

// Get sorted ask prices (lowest first)
export function getSortedAskPrices(book: OrderBook): number[] {
  return Array.from(book.asks.keys()).sort((a, b) => a - b);
}

// Admin function to seed user balance (for testing only)
export function seedUserBalance(payload: Record<string, unknown>): EngineResponse {
  try {
    const { userId, balances } = payload as { 
      userId: string; 
      balances: Record<string, number>;
    };

    if (!userId || !balances) {
      return {
        correlationId: '',
        ok: false,
        error: 'userId and balances required',
      };
    }

    // Get or create balance and set the values
    const balance = getBalance(userId, false);
    balance.balances = { ...balances };
    
    // Update the map
    BALANCES.set(userId, balance);

    return {
      correlationId: '',
      ok: true,
      data: { userId, balances: balance.balances },
    };
  } catch (error) {
    return {
      correlationId: '',
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
