import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './service.js';
import prisma from '../../config/prisma.js';
import type { RegisterInput, LoginInput } from './types.js';

const authService = new AuthService();

export const statsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  // Use actual WebSocket online map (set in server.ts) — accurate real-time count
  const onlineMap: Map<string, Set<any>> | undefined = (req.server as any).onlineUsers
  const online = onlineMap ? onlineMap.size : 0

  const [users, posts] = await Promise.all([
    prisma.user.count({ where: { deleted_at: null } }),
    prisma.post.count({ where: { deleted_at: null } }),
  ])
  return reply.send({ success: true, data: { users, posts, online }, error: null })
}

export const forgotPasswordHandler = async (
  request: FastifyRequest<{ Body: { email: string } }>,
  reply: FastifyReply,
) => {
  try {
    await authService.requestPasswordReset(request.body.email)
    // Всегда отвечаем успехом — не раскрываем существование аккаунта
    return reply.send({ success: true, data: { message: 'Если аккаунт существует, код отправлен' }, error: null })
  } catch {
    return reply.code(500).send({ success: false, data: null, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  }
}

export const resetPasswordHandler = async (
  request: FastifyRequest<{ Body: { code: string; password: string } }>,
  reply: FastifyReply,
) => {
  try {
    await authService.resetPassword(request.body.code, request.body.password)
    return reply.send({ success: true, data: { message: 'Пароль успешно изменён' }, error: null })
  } catch (e: any) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'RESET_ERROR', message: e.message } })
  }
}

export const registerHandler = async (
  request: FastifyRequest<{ Body: RegisterInput }>,
  reply: FastifyReply,
) => {
  try {
    const user = await authService.createUser(request.body);
    return reply.code(201).send({ success: true, data: { user }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return reply.code(400).send({
      success: false,
      data: null,
      error: { code: 'REGISTRATION_ERROR', message },
    });
  }
};

export const loginHandler = async (
  request: FastifyRequest<{ Body: LoginInput }>,
  reply: FastifyReply,
) => {
  try {
    const { email, password } = request.body;
    const user = await authService.loginUser(email, password);

    if (!user) {
      return reply.code(401).send({
        success: false,
        data: null,
        error: { code: 'AUTH_FAILED', message: 'Invalid email or password' },
      });
    }

    const token = request.server.jwt.sign(
      { id: user.id, role: user.role },
      { expiresIn: '7d' },
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return reply.code(500).send({
      success: false,
      data: null,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
};
