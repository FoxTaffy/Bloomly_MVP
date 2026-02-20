import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createPostHandler, votePostHandler, getPostsHandler } from './controller.js';

// Переиспользуем тип кастомного декоратора authenticate
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// Схема валидации для POST /api/posts
const createPostSchema = {
  body: {
    type: 'object',
    required: ['content'],
    properties: {
      content: { type: 'string', minLength: 1 },
      isNsfw: { type: 'boolean' },
    },
  },
};

// Схема валидации для POST /api/posts/:id/vote
const voteSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    required: ['value'],
    properties: {
      // Допустимы только значения 1 и -1
      value: { type: 'integer', enum: [1, -1] },
    },
  },
};

// Схема валидации для GET /api/posts
const getPostsSchema = {
  querystring: {
    type: 'object',
    properties: {
      sortBy: { type: 'string', enum: ['date', 'rating'] },
    },
  },
};

export async function postsRoutes(fastify: FastifyInstance) {
  // Создать пост — только для авторизованных пользователей
  fastify.post('/', { schema: createPostSchema, onRequest: [fastify.authenticate] }, createPostHandler);

  // Проголосовать за пост — только для авторизованных пользователей
  fastify.post('/:id/vote', { schema: voteSchema, onRequest: [fastify.authenticate] }, votePostHandler);

  // Получить ленту постов — публичный эндпоинт
  fastify.get('/', { schema: getPostsSchema }, getPostsHandler);
}
