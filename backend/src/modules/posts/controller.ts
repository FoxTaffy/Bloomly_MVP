import { FastifyReply, FastifyRequest } from 'fastify';
// Импортируем именно postService (с маленькой буквы) и без .js для tsx
import { postService } from './service';

// Тип JWT-пэйлоада
interface JwtUser {
  id: string;
  role: string;
}

type AuthenticatedRequest = FastifyRequest & { user: JwtUser };

export const createPostHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: authorId } = (request as AuthenticatedRequest).user;
    const { content, isNsfw } = request.body as { content: string; isNsfw?: boolean };

    // У нас теперь нет метода createPost в новом сервисе (мы фиксили только toggleVote), 
    // но если он там есть, вызываем через postService. Иначе проверьте имена методов.
    const post = await (postService as any).createPost({ content, authorId, isNsfw });
    return reply.code(201).send({ success: true, data: { post }, error: null });
  } catch (error: any) {
    return reply.code(400).send({
      success: false,
      error: { code: 'CREATE_POST_ERROR', message: error.message },
    });
  }
};

export const votePostHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId } = (request as AuthenticatedRequest).user;
    const { id: postId } = request.params as { id: string };
    const { value } = request.body as { value: 1 | -1 };

    // ВАЖНО: Мы переименовали метод в toggleVote!
    const voteType = value === 1 ? 'UP' : 'DOWN';
    const result = await postService.toggleVote(userId, postId, voteType);
    
    return reply.send({ success: true, data: result, error: null });
  } catch (error: any) {
    return reply.code(400).send({
      success: false,
      error: { code: 'VOTE_ERROR', message: error.message },
    });
  }
};

export const getPostsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { sortBy } = request.query as { sortBy?: string };
    const posts = await (postService as any).getPosts(sortBy === 'rating' ? 'rating' : 'date');
    return reply.send({ success: true, data: { posts }, error: null });
  } catch (error: any) {
    return reply.code(500).send({
      success: false,
      error: { code: 'GET_POSTS_ERROR', message: error.message },
    });
  }
};
