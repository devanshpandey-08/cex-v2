import { z } from 'zod';

export const signupSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
});

export const signinSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
});

export const orderSchema = z.object({
  type: z.enum(['limit', 'market']),
  side: z.enum(['buy', 'sell']),
  symbol: z.string().min(1).max(20),
  price: z.number().positive().optional(),
  qty: z.number().positive(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type SigninInput = z.infer<typeof signinSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
