import { Router } from 'express';
import { signup, signin } from '../controllers/auth-controller.js';

export const authRouter = Router();

authRouter.post('/signup', signup);
authRouter.post('/signin', signin);
