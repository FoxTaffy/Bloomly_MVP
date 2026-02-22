import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { adminService } from './service.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

function requireAdmin(roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await (fastify as any).authenticate(request, reply);
    const user = (request as any).user;
    if (!roles.includes(user.role)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Нет прав администратора' } });
    }
  };
}

let fastify: FastifyInstance;

export async function adminRoutes(f: FastifyInstance) {
  fastify = f;

  const adminAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    await f.authenticate(request, reply);
    const user = (request as any).user;
    if (!['admin', 'moderator'].includes(user.role)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Нет прав администратора' } });
    }
  };

  const superAdminAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    await f.authenticate(request, reply);
    const user = (request as any).user;
    if (user.role !== 'admin') {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Только для администраторов' } });
    }
  };

  f.get('/stats', { onRequest: [adminAuth] }, async (request, reply) => {
    try {
      const stats = await adminService.getStats();
      return reply.send({ success: true, data: stats, error: null });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: { code: 'STATS_ERROR', message: error.message } });
    }
  });

  f.get('/reports', { onRequest: [adminAuth] }, async (request, reply) => {
    try {
      const { status, page, limit } = request.query as any;
      const reports = await adminService.getReports(status, parseInt(page) || 1, parseInt(limit) || 20);
      return reply.send({ success: true, data: { reports }, error: null });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: { code: 'GET_REPORTS_ERROR', message: error.message } });
    }
  });

  f.put('/reports/:id', { onRequest: [adminAuth] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { status } = request.body as { status: 'reviewed' | 'rejected' };
      const report = await adminService.updateReport(id, status);
      return reply.send({ success: true, data: { report }, error: null });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: { code: 'UPDATE_REPORT_ERROR', message: error.message } });
    }
  });

  f.get('/users', { onRequest: [adminAuth] }, async (request, reply) => {
    try {
      const { page, limit, role } = request.query as any;
      const users = await adminService.getUsers(parseInt(page) || 1, parseInt(limit) || 20, role);
      return reply.send({ success: true, data: { users }, error: null });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: { code: 'GET_USERS_ERROR', message: error.message } });
    }
  });

  f.put('/users/:id/role', { onRequest: [superAdminAuth] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { role } = request.body as { role: 'user' | 'moderator' | 'admin' };
      const user = await adminService.updateUserRole(id, role);
      return reply.send({ success: true, data: { user }, error: null });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: { code: 'UPDATE_ROLE_ERROR', message: error.message } });
    }
  });

  f.post('/users/:id/block', { onRequest: [adminAuth] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const result = await adminService.toggleUserBlock(id);
      return reply.send({ success: true, data: result, error: null });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: { code: 'BLOCK_USER_ERROR', message: error.message } });
    }
  });

  f.delete('/posts/:id', { onRequest: [adminAuth] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await adminService.deletePost(id);
      return reply.send({ success: true, data: null, error: null });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: { code: 'DELETE_POST_ERROR', message: error.message } });
    }
  });

  f.delete('/comments/:id', { onRequest: [adminAuth] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await adminService.deleteComment(id);
      return reply.send({ success: true, data: null, error: null });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: { code: 'DELETE_COMMENT_ERROR', message: error.message } });
    }
  });
}
