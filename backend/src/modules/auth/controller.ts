import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './service.js';

const authService = new AuthService();

// Хендлер регистрации
export const registerHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const user = await authService.createUser(request.body as any);
    return reply.code(201).send({ success: true, data: { user }, error: null });
  } catch (error: any) {
    return reply.code(400).send({
      success: false,
      error: { code: 'REGISTRATION_ERROR', message: error.message }
    });
  }
};

// Хендлер логина
export const loginHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { email, password } = request.body as any;

    // 1. Проверяем пользователя через сервис (email + пароль)
    const user = await authService.loginUser(email, password);

    if (!user) {
      return reply.code(401).send({
        success: false,
        error: { code: 'AUTH_FAILED', message: 'Неверный email или пароль' }
      });
    }

    // 2. Генерируем JWT-токен с id и ролью пользователя
    const token = request.server.jwt.sign(
      { id: user.id, role: user.role },
      { expiresIn: '15m' }
    );

    return reply.send({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      },
      error: null,
    });
  } catch (error: any) {
    return reply.code(500).send({
      success: false,
      error: { message: 'Внутренняя ошибка сервера при входе' }
    });
  }
};