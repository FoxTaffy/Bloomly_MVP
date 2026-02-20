async toggleVote(userId: string, postId: string, voteType: 'UP' | 'DOWN') {
  return await prisma.$transaction(async (tx) => {
    // 1. Проверяем, есть ли уже голос от этого юзера за этот пост
    const existingVote = await tx.vote.findUnique({
      where: {
        userId_postId: { userId, postId }
      }
    });

    if (existingVote) {
      if (existingVote.type === voteType) {
        // Если юзер кликнул по тому же типу — удаляем голос (отмена лайка/дизлайка)
        await tx.vote.delete({ where: { id: existingVote.id } });
      } else {
        // Если юзер изменил мнение — меняем UP на DOWN или наоборот
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

    // 3. Пересчитываем итоговый рейтинг (UP = +1, DOWN = -1)
    const votes = await tx.vote.findMany({ where: { postId } });
    const newRating = votes.reduce((acc, v) => acc + (v.type === 'UP' ? 1 : -1), 0);

    // 4. Обновляем рейтинг в таблице постов для быстрого чтения
    return await tx.post.update({
      where: { id: postId },
      data: { rating: newRating }
    });
  });
}