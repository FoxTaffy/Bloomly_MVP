import type { FastifyError, FastifyInstance } from 'fastify';
import { errCode, errMessage, errStatus } from '../lib/httpErrors.js';

const PRISMA_HTTP: Record<string, number> = { P2002: 409, P2003: 400, P2023: 400, P2025: 404 };

export function registerErrorHandling(app: FastifyInstance) {
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const code = errCode(error);
    const status = errStatus(error) ?? (code ? PRISMA_HTTP[code] : undefined) ?? 500;
    if (status >= 500) request.log.error({ err: error }, 'Request failed');
    const message = status >= 500 ? 'Internal server error'
      : code?.startsWith('P20') ? (status === 409 ? 'Record already exists' : status === 404 ? 'Not found' : 'Invalid request')
      : errMessage(error);
    return reply.code(status).send({ success: false, data: null, error: { code: code ?? 'SERVER_ERROR', message } });
  });

  // Controllers may send a handled 5xx directly. Their diagnostic message must
  // follow the same public contract as exceptions reaching the error handler.
  app.addHook('onSend', async (request, reply, payload) => {
    if (reply.statusCode < 500 || typeof payload !== 'string') return payload;
    const type = String(reply.getHeader('content-type') ?? '');
    if (!type.includes('application/json')) return payload;
    try {
      const value = JSON.parse(payload) as { error?: unknown };
      const error = value.error;
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code)
        ? error.code : 'SERVER_ERROR';
      return JSON.stringify({ success: false, data: null, error: { code, message: 'Internal server error' } });
    } catch {
      request.log.error('Could not serialize server error response');
      return payload;
    }
  });
}
