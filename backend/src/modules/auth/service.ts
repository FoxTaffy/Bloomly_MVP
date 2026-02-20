import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma.js';

export class AuthService {
  async createUser(data: any) {
    const { email, password, username } = data;

    // Хешируем пароль (10 раундов salt)
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      // Транзакция гарантирует, что юзер и кошелёк создаются вместе или не создаются вовсе
      const user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email,
            username,
            password: hashedPassword,
          },
          select: {
            id: true,
            email: true,
            username: true,
            created_at: true,
          },
        });

        // Создаём кошелёк для нового пользователя (баланс 0.00)
        await tx.wallet.create({
          data: {
            user_id: newUser.id,
          },
        });

        return newUser;
      });

      return user;
    } catch (error: unknown) {
      // Обрабатываем ошибку уникальности Prisma (P2002)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const fields = (error.meta?.target as string[]) ?? [];
        if (fields.includes('email')) {
          throw new Error('Пользователь с таким email уже существует');
        }
        if (fields.includes('username')) {
          throw new Error('Пользователь с таким username уже существует');
        }
        throw new Error('Пользователь с такими данными уже существует');
      }
      throw error;
    }
  }

  async findUserByEmail(email: string) {
    return await prisma.user.findUnique({
      where: { email },
    });
  }

  // Проверяет email и пароль, возвращает пользователя без пароля или null
  async loginUser(email: string, password: string) {
    // Ищем пользователя по email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return null;

    // Сравниваем хеш пароля
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;

    // Возвращаем пользователя без поля пароля
    const { password: _password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async validateUser(email: string, pass: string) {
    return this.loginUser(email, pass);
  }
}