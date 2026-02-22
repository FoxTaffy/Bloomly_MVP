import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma.js';
import type { RegisterInput } from './types.js';

export class AuthService {
  async createUser(data: RegisterInput) {
    const { email, password, username } = data;
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      return await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: { email, username, password: hashedPassword },
          select: {
            id: true,
            email: true,
            username: true,
            role: true,
            created_at: true,
          },
        });

        await tx.wallet.create({ data: { user_id: newUser.id } });

        return newUser;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const fields = (error.meta?.target as string[]) ?? [];
        if (fields.includes('email')) throw new Error('Email is already registered');
        if (fields.includes('username')) throw new Error('Username is already taken');
        throw new Error('User with this data already exists');
      }
      throw error;
    }
  }

  async loginUser(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email, deleted_at: null },
    });
    if (!user) return null;

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;

    const { password: _password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}
