import { FastifyReply, FastifyRequest } from 'fastify';
import { PostsService } from './service.js';

const postsService = new PostsService();

// Тип JWT-пэйлоада, который устанавливается в request.user после аутентификации
interface JwtUser {
  id: string;
  role: string;
}

type AuthenticatedRequest = FastifyRequest & { user: JwtUser };

// Хендлер создания поста
export const createPostHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: authorId } = (request as AuthenticatedRequest).user;
    const { content, isNsfw } = request.body as { content: string; isNsfw?: boolean };

    const post = await postsService.createPost({ content, authorId, isNsfw });
    return reply.code(201).send({ success: true, data: { post }, error: null });
  } catch (error: any) {
    return reply.code(400).send({
      success: false,
      error: { code: 'CREATE_POST_ERROR', message: error.message },
    });
  }
};

// Хендлер голосования за пост
export const votePostHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId } = (request as AuthenticatedRequest).user;
    const { id: postId } = request.params as { id: string };
    const { value } = request.body as { value: 1 | -1 };

    const result = await postsService.votePost(postId, userId, value);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: any) {
    const statusCode = error.message === 'Пост не найден' ? 404 : 400;
    return reply.code(statusCode).send({
      success: false,
      error: { code: 'VOTE_ERROR', message: error.message },
    });
  }
};

// Хендлер получения ленты постов
export const getPostsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { sortBy } = request.query as { sortBy?: string };
    const posts = await postsService.getPosts(sortBy === 'rating' ? 'rating' : 'date');
    return reply.send({ success: true, data: { posts }, error: null });
  } catch (error: any) {
    return reply.code(500).send({
      success: false,
      error: { code: 'GET_POSTS_ERROR', message: error.message },
    });
  }
};
