import { registerHandler, loginHandler } from './controller.js';

export async function authRoutes(fastify: any) {
    fastify.post('/register', registerHandler);
    fastify.post('/login', loginHandler);
    
    // Добавляем этот роут
    fastify.get('/me', { onRequest: [fastify.authenticate] }, async (request: any) => {
      return { 
        success: true, 
        user: request.user // Здесь будут данные из JWT (id, email)
      };
    });
  }