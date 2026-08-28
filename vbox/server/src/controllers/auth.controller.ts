import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { config } from '../config/env';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function login(req: Request, res: Response) {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid email or password format' });
  }

  const { email, password } = result.data;

  let user = await prisma.user.findUnique({ where: { email } });

  // If no user exists in database at all, auto-create initial user for ease of initial setup
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    const hashedPassword = await bcrypt.hash(password, 10);
    user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword
      }
    });
  } else if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  } else {
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
  }

  const token = jwt.sign(
    { id: user.id, email: user.email },
    config.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  return res.json({
    user: { id: user.id, email: user.email },
    token
  });
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie('token');
  return res.json({ success: true, message: 'Logged out successfully' });
}

export async function me(req: any, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  return res.json({ user: req.user });
}
