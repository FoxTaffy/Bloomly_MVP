import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './service.js';
import type { RegisterInput, LoginInput } from './types.js';

const authService = new AuthService();

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
