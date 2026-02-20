// backend/src/modules/posts/service.ts
import { prisma } from '../../config/prisma.js'; // Проверь путь к prisma client

export class PostService {
  async toggleVote(userId: string, postId: string, voteType: 'UP' | 'DOWN') {
    return await prisma.$transaction(async (tx) => {
      // 1. Ищем старый голос этого юзера под этим постом
      const existingVote = await tx.vote.findUnique({
        where: {
          userId_postId: { userId, postId }
        }
      });

      if (existingVote) {
        if (existingVote.type === voteType) {
          // Если кликнул повторно на то же самое — удаляем голос (отмена)
          await tx.vote.delete({ where: { id: existingVote.id } });
        } else {
          // Если изменил мнение (был UP, стал DOWN) — обновляем
          await tx.vote.update({
            where: { id: existingVote.id },
            data: { type: voteType }
          });
        }
      } else {
        // 2. Голоса нет — создаем новый
        await tx.vote.create({
          data: { userId, postId, type: voteType }
        });
      }

      // 3. Пересчитываем итоговый рейтинг
      const votes = await tx.vote.findMany({ where: { postId } });
      const newRating = votes.reduce((acc, v) => acc + (v.type === 'UP' ? 1 : -1), 0);

      // 4. Обновляем поле rating в посте для быстрого отображения в ленте
      return await tx.post.update({
        where: { id: postId },
        data: { rating: newRating }
      });
    });
  }
}