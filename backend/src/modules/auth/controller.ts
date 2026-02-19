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

// Хендлер логина (ТО, ЧЕГО НЕ ХВАТАЛО)
export const loginHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { email, password } = request.body as any;
    
    // 1. Проверяем пользователя через сервис
    const user = await authService.validateUser(email, password);

    if (!user) {
      return reply.code(401).send({
        success: false,
        error: { code: 'AUTH_FAILED', message: 'Неверный email или пароль' }
      });
    }

    // 2. Генерируем токены (используем встроенный в fastify плагин jwt)
    const accessToken = request.server.jwt.sign(
      { id: user.id, email: user.email }, 
      { expiresIn: '15m' }
    );
    
    const refreshToken = request.server.jwt.sign(
      { id: user.id }, 
      { expiresIn: '7d' }
    );

    return reply.send({
      success: true,
      data: {
        user,
        tokens: {
          access: accessToken,
          refresh: refreshToken
        }
      },
      error: null
    });
  } catch (error: any) {
    return reply.code(500).send({
      success: false,
      error: { message: 'Внутренняя ошибка сервера при входе' }
    });
  }
};