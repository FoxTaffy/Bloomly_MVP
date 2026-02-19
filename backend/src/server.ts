import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import * as dotenv from 'dotenv';
import { authRoutes } from './modules/auth/routes.js'; 

dotenv.config();

const fastify = Fastify({ 
  logger: true 
});

fastify.register(cors, { origin: true });
fastify.register(jwt, { secret: process.env.JWT_SECRET || 'bloomly_secret_2026' });

fastify.decorate("authenticate", async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.send(err);
  }
});

// Регистрируем роуты
fastify.register(authRoutes, { prefix: '/api/auth' });

fastify.get('/health', async () => {
  return { success: true, message: 'Bloomly Backend is running' };
});

const start = async () => {
  try {
    await fastify.listen({ port: 8080, host: '0.0.0.0' });
    console.log('🚀 Server ready at http://localhost:8080');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();