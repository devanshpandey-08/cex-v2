import { v4 as uuidv4 } from 'uuid';
import {
  OrderRecord,
  Fill,
  EngineResponse,
} from '../types/index.js';
import {
  ORDERS,
  FILLS,
  PROCESSED_REQUESTS,
  getOrderBook,
  getBalance,
  addOrderToBook,
  removeOrderFromBook,
  getSortedBidPrices,
  getSortedAskPrices,
} from '../store/exchange-store.js';

// Create a new order and perform matching
// NOTE: This function handles both limit and market orders
export function createOrder(payload: Record<string, unknown>): EngineResponse {
  try {
    const {
      userId,
      type,
      side,
      symbol,
      price,
      qty,
      requestId, // Idempotency key from client
    } = payload as {
      userId: string;
      type: 'limit' | 'market';
      side: 'buy' | 'sell';
      symbol: string;
      price?: number;
      qty: number;
      requestId?: string;
    };

    // IDEMPOTENCY CHECK: If we've seen this requestId before, return cached result
    // This prevents double-spending on network retries
    if (requestId && PROCESSED_REQUESTS.has(requestId)) {
      const cachedOrderId = PROCESSED_REQUESTS.get(requestId)!;
      const existingOrder = ORDERS.get(cachedOrderId);
      if (existingOrder) {
        return {
          correlationId: '',
          ok: true,
          data: { order: existingOrder },
        };
      }
    }

    // Basic validation
    if (!userId || !type || !side || !symbol || !qty || qty <= 0) {
      return {
        correlationId: '',
        ok: false,
        error: 'Invalid order parameters',
      };
    }

    if (type === 'limit' && price === undefined) {
      return {
        correlationId: '',
        ok: false,
        error: 'Price is required for limit orders',
      };
    }

    // Get user balance - don't auto-seed, user must have funds
    const balance = getBalance(userId, false);

    // Check sufficient balance before proceeding
    if (side === 'buy' && type === 'limit') {
      const requiredUSD = price! * qty;
      if ((balance.balances['USD'] || 0) < requiredUSD) {
        return {
          correlationId: '',
          ok: false,
          error: 'Insufficient USD balance',
        };
      }
      // Lock the funds immediately
      balance.balances['USD'] -= requiredUSD;
    } else if (side === 'sell') {
      const asset = symbol; // e.g., BTC
      if ((balance.balances[asset] || 0) < qty) {
        return {
          correlationId: '',
          ok: false,
          error: `Insufficient ${asset} balance`,
        };
      }
      // Lock the asset
      balance.balances[asset] -= qty;
    }

    // Create order record
    // Using requestId as part of orderId if provided for easier debugging
    const orderId = requestId ? `order_${requestId}` : uuidv4();
    const order: OrderRecord = {
      orderId,
      userId,
      type,
      side,
      symbol,
      price,
      qty,
      filledQty: 0,
      remainingQty: qty,
      status: 'open',
      fills: [],
      createdAt: Date.now(),
    };

    // Store the requestId -> orderId mapping for idempotency
    if (requestId) {
      PROCESSED_REQUESTS.set(requestId, orderId);
    }

    // Perform matching against the order book
    const book = getOrderBook(symbol);
    const fills: Fill[] = [];

    if (side === 'buy') {
      // Buy order matches against asks (lowest price first)
      const askPrices = getSortedAskPrices(book);
      
      for (const askPrice of askPrices) {
        if (order.remainingQty <= 0) break;
        
        // For limit orders, stop if ask price is too high
        if (type === 'limit' && price! < askPrice) break;
        
        const level = book.asks.get(askPrice)!;
        const ordersToRemove: string[] = [];

        for (const askOrderId of level.orders) {
          if (order.remainingQty <= 0) break;
          
          const askOrder = ORDERS.get(askOrderId);
          if (!askOrder || askOrder.status === 'filled' || askOrder.status === 'cancelled') {
            ordersToRemove.push(askOrderId);
            continue;
          }

          const matchQty = Math.min(order.remainingQty, askOrder.remainingQty);
          
          // Create fill record
          const fill: Fill = {
            fillId: uuidv4(),
            orderId,
            matchedOrderId: askOrderId,
            price: askPrice,
            qty: matchQty,
            timestamp: Date.now(),
          };
          fills.push(fill);
          FILLS.push(fill);

          // Update both orders
          order.filledQty += matchQty;
          order.remainingQty -= matchQty;
          order.fills.push(fill);

          askOrder.filledQty += matchQty;
          askOrder.remainingQty -= matchQty;

          // Update ask order status
          if (askOrder.remainingQty === 0) {
            askOrder.status = 'filled';
            ordersToRemove.push(askOrderId);
            
            // Release locked funds to seller (USD)
            const sellerBalance = getBalance(askOrder.userId);
            if (askOrder.type === 'limit') {
              sellerBalance.balances['USD'] += askPrice * askOrder.filledQty;
            }
          } else {
            askOrder.status = 'partially_filled';
          }
        }

        // Clean up filled orders from this price level
        level.orders = level.orders.filter(id => !ordersToRemove.includes(id));
        if (level.orders.length === 0) {
          book.asks.delete(askPrice);
        } else {
          level.totalQty = level.orders.reduce((sum, oid) => {
            const o = ORDERS.get(oid);
            return sum + (o?.remainingQty || 0);
          }, 0);
        }
      }
    } else {
      // Sell order matches against bids (highest price first)
      const bidPrices = getSortedBidPrices(book);
      
      for (const bidPrice of bidPrices) {
        if (order.remainingQty <= 0) break;
        
        // For limit orders, stop if bid price is too low
        if (type === 'limit' && price! > bidPrice) break;
        
        const level = book.bids.get(bidPrice)!;
        const ordersToRemove: string[] = [];

        for (const bidOrderId of level.orders) {
          if (order.remainingQty <= 0) break;
          
          const bidOrder = ORDERS.get(bidOrderId);
          if (!bidOrder || bidOrder.status === 'filled' || bidOrder.status === 'cancelled') {
            ordersToRemove.push(bidOrderId);
            continue;
          }

          const matchQty = Math.min(order.remainingQty, bidOrder.remainingQty);
          
          // Create fill record
          const fill: Fill = {
            fillId: uuidv4(),
            orderId,
            matchedOrderId: bidOrderId,
            price: bidPrice,
            qty: matchQty,
            timestamp: Date.now(),
          };
          fills.push(fill);
          FILLS.push(fill);

          // Update both orders
          order.filledQty += matchQty;
          order.remainingQty -= matchQty;
          order.fills.push(fill);

          bidOrder.filledQty += matchQty;
          bidOrder.remainingQty -= matchQty;

          // Update bid order status
          if (bidOrder.remainingQty === 0) {
            bidOrder.status = 'filled';
            ordersToRemove.push(bidOrderId);
            
            // Release locked USD to buyer and give them the asset
            if (bidOrder.type === 'limit') {
              const buyerBalance = getBalance(bidOrder.userId);
              const asset = bidOrder.symbol;
              buyerBalance.balances[asset] += bidOrder.filledQty;
            }
          } else {
            bidOrder.status = 'partially_filled';
          }
        }

        // Clean up filled orders from this price level
        level.orders = level.orders.filter(id => !ordersToRemove.includes(id));
        if (level.orders.length === 0) {
          book.bids.delete(bidPrice);
        } else {
          level.totalQty = level.orders.reduce((sum, oid) => {
            const o = ORDERS.get(oid);
            return sum + (o?.remainingQty || 0);
          }, 0);
        }
      }
    }

    // Update final order status
    if (order.remainingQty === 0) {
      order.status = 'filled';
    } else if (order.filledQty > 0) {
      order.status = 'partially_filled';
    }

    // Store order in memory
    ORDERS.set(orderId, order);

    // Add remaining quantity to order book (only for limit orders)
    if (type === 'limit' && order.remainingQty > 0) {
      addOrderToBook(order);
    } else if (order.remainingQty > 0 && type === 'market') {
      // Market order couldn't be fully filled - keep as partially filled
      // In a real exchange, we'd either reject or fill what's available
      order.status = 'partially_filled';
    }

    // Release any unused locked funds
    if (side === 'buy' && type === 'limit') {
      const unusedUSD = (price! * qty) - (price! * order.filledQty);
      if (unusedUSD > 0) {
        balance.balances['USD'] += unusedUSD;
      }
    } else if (side === 'sell' && order.remainingQty > 0) {
      const asset = symbol;
      balance.balances[asset] += order.remainingQty;
    }

    return {
      correlationId: '',
      ok: true,
      data: {
        orderId: order.orderId,
        status: order.status,
        filledQty: order.filledQty,
        remainingQty: order.remainingQty,
        fills: order.fills,
      },
    };
  } catch (error) {
    console.error('Create order error:', error);
    return {
      correlationId: '',
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Get order by ID
export function getOrder(payload: Record<string, unknown>): EngineResponse {
  try {
    const { orderId } = payload as { orderId: string };

    const order = ORDERS.get(orderId);
    if (!order) {
      return {
        correlationId: '',
        ok: false,
        error: 'Order not found',
      };
    }

    return {
      correlationId: '',
      ok: true,
      data: {
        orderId: order.orderId,
        status: order.status,
        type: order.type,
        side: order.side,
        symbol: order.symbol,
        price: order.price,
        qty: order.qty,
        filledQty: order.filledQty,
        remainingQty: order.remainingQty,
        fills: order.fills,
        createdAt: order.createdAt,
      },
    };
  } catch (error) {
    return {
      correlationId: '',
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Cancel order
export function cancelOrder(payload: Record<string, unknown>): EngineResponse {
  try {
    const { orderId } = payload as { orderId: string };

    const order = ORDERS.get(orderId);
    if (!order) {
      return {
        correlationId: '',
        ok: false,
        error: 'Order not found',
      };
    }

    if (order.status === 'filled' || order.status === 'cancelled') {
      return {
        correlationId: '',
        ok: false,
        error: `Cannot cancel order with status: ${order.status}`,
      };
    }

    // Remove from order book
    removeOrderFromBook(order);

    // Release locked funds
    const balance = getBalance(order.userId);
    if (order.side === 'buy' && order.type === 'limit' && order.price) {
      const refundAmount = order.price * order.remainingQty;
      balance.balances['USD'] += refundAmount;
    } else if (order.side === 'sell') {
      balance.balances[order.symbol] += order.remainingQty;
    }

    // Update order status
    order.status = 'cancelled';
    order.remainingQty = 0;

    return {
      correlationId: '',
      ok: true,
      data: {
        orderId: order.orderId,
        status: 'cancelled',
      },
    };
  } catch (error) {
    return {
      correlationId: '',
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Get market depth
export function getDepth(payload: Record<string, unknown>): EngineResponse {
  try {
    const { symbol } = payload as { symbol: string };

    const book = getOrderBook(symbol);

    // Build bids array (highest price first)
    const bids = getSortedBidPrices(book).map(price => {
      const level = book.bids.get(price)!;
      return {
        price,
        qty: level.totalQty,
      };
    });

    // Build asks array (lowest price first)
    const asks = getSortedAskPrices(book).map(price => {
      const level = book.asks.get(price)!;
      return {
        price,
        qty: level.totalQty,
      };
    });

    return {
      correlationId: '',
      ok: true,
      data: {
        symbol,
        bids,
        asks,
      },
    };
  } catch (error) {
    return {
      correlationId: '',
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Get user balance
export function getUserBalance(payload: Record<string, unknown>): EngineResponse {
  try {
    const { userId } = payload as { userId: string };

    const balance = getBalance(userId);

    return {
      correlationId: '',
      ok: true,
      data: {
        userId,
        balances: balance.balances,
      },
    };
  } catch (error) {
    return {
      correlationId: '',
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
