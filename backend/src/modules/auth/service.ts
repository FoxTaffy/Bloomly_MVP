import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

export class AuthService {
  async createUser(data: any) {
    const { email, password, username } = data;
    
    // Хешируем пароль (10 раундов salt)
    const hashedPassword = await bcrypt.hash(password, 10);

    return await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        username: true,
        created_at: true
      }
    });
  }

  async findUserByEmail(email: string) {
    return await prisma.user.findUnique({
      where: { email }
    });
  }
  async validateUser(email: string, pass: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return null;

    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) return null;

    // Возвращаем пользователя без пароля
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}