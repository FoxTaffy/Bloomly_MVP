import prisma from '../../config/prisma.js';

// Поля автора, возвращаемые вместе с постом
const authorSelect = {
  id: true,
  username: true,
  display_name: true,
};

export class PostsService {
  // Создать новый пост
  async createPost(data: { content: string; authorId: string; isNsfw?: boolean }) {
    return await prisma.post.create({
      data: {
        content: data.content,
        author_id: data.authorId,
        is_nsfw: data.isNsfw ?? false,
      },
      include: {
        author: { select: authorSelect },
      },
    });
  }

  // Проголосовать за пост (value: 1 или -1).
  // Логика: один голос на пользователя — повторный тот же голос отменяет его,
  // противоположный голос меняет его. Рейтинг пересчитывается атомарно.
  async votePost(postId: string, userId: string, value: 1 | -1) {
    return await prisma.$transaction(async (tx) => {
      // Проверяем, что пост существует
      const post = await tx.post.findUnique({ where: { id: postId } });
      if (!post) throw new Error('Пост не найден');

      // Ищем существующий голос этого пользователя
      const existingVote = await tx.vote.findUnique({
        where: { user_id_post_id: { user_id: userId, post_id: postId } },
      });

      if (existingVote) {
        if (existingVote.value === value) {
          // Тот же голос — отменяем: удаляем запись и уменьшаем рейтинг
          await tx.vote.delete({
            where: { user_id_post_id: { user_id: userId, post_id: postId } },
          });
          const updated = await tx.post.update({
            where: { id: postId },
            data: { rating: { decrement: value } },
            include: { author: { select: authorSelect } },
          });
          return { post: updated, action: 'removed' as const };
        } else {
          // Другой голос — меняем: обновляем запись, рейтинг сдвигается на 2
          await tx.vote.update({
            where: { user_id_post_id: { user_id: userId, post_id: postId } },
            data: { value },
          });
          const updated = await tx.post.update({
            where: { id: postId },
            data: { rating: { increment: value * 2 } },
            include: { author: { select: authorSelect } },
          });
          return { post: updated, action: 'changed' as const };
        }
      } else {
        // Новый голос — создаём запись и увеличиваем рейтинг
        await tx.vote.create({
          data: { user_id: userId, post_id: postId, value },
        });
        const updated = await tx.post.update({
          where: { id: postId },
          data: { rating: { increment: value } },
          include: { author: { select: authorSelect } },
        });
        return { post: updated, action: 'added' as const };
      }
    });
  }

  // Получить список постов (сортировка по дате или рейтингу)
  async getPosts(sortBy: 'date' | 'rating' = 'date') {
    return await prisma.post.findMany({
      orderBy: sortBy === 'rating' ? { rating: 'desc' } : { created_at: 'desc' },
      include: {
        author: { select: authorSelect },
      },
    });
  }
}
