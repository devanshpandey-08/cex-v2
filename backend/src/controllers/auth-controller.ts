import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { prisma } from '../db.js';
import { signupSchema, signinSchema } from '../utils/validators.js';
import { createToken } from '../utils/auth.js';

// TODO: Move this to a separate service layer
export async function signup(req: Request, res: Response): Promise<void> {
  try {
    const validation = signupSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
      return;
    }

    const { username, password } = validation.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }

    // Hash password - using salt rounds of 10 (might increase later for prod)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
      },
    });

    // Generate JWT token
    const token = createToken({
      userId: user.id,
      username: user.username,
    });

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: user.id,
        username: user.username,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    // FIXME: Should handle specific error types better
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function signin(req: Request, res: Response): Promise<void> {
  try {
    const validation = signinSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
      return;
    }

    const { username, password } = validation.data;

    // Find user by username
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Generate JWT token
    const token = createToken({
      userId: user.id,
      username: user.username,
    });

    res.json({
      message: 'Signed in successfully',
      token,
      user: {
        id: user.id,
        username: user.username,
      },
    });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
