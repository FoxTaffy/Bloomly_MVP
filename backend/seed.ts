import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const user = await prisma.user.upsert({
    where: { username: 'testuser' },
    update: {
      display_name: 'Test User',
    },
    create: {
      username: 'testuser',
      email: 'test@bloomly.fun',
      password: '$2a$10$X7.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1',
      display_name: 'Test User',
      likes: [],
      dislikes: [],
    },
  });

  const postsData = [
    {
      content: 'Мой первый цифровой арт! 🎨 Как вам?',
      category: 'digital_art',
      tags: ['art', 'digital', 'firstpost'],
      is_nsfw: false,
      media_urls: ['https://images.unsplash.com/photo-1547826039-bfc35e0f1ea8?q=80&w=1000&auto=format&fit=crop'],
    },
    {
      content: 'Немного уличной фотографии с последней прогулки 📸',
      category: 'photography',
      tags: ['street', 'photo', 'city'],
      is_nsfw: false,
      media_urls: ['https://images.unsplash.com/photo-1493246507139-91e8fad9978e?q=80&w=1000&auto=format&fit=crop'],
    },
    {
      content: 'Тестовый NSFW контент (размытие должно работать) 🔞',
      category: 'other',
      tags: ['nsfw', 'adult', 'test'],
      is_nsfw: true,
      media_urls: ['https://images.unsplash.com/photo-1508615039623-a25605d2b022?q=80&w=1000&auto=format&fit=crop'],
    },
    {
      content: 'Процесс создания новой 3D модели 🧊',
      category: '3d',
      tags: ['3d', 'blender', 'wip'],
      is_nsfw: false,
      media_urls: ['https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop'],
    },
    {
      content: 'Небольшой набросок для будущей анимации ✨',
      category: 'animation',
      tags: ['sketch', 'animation', '2d'],
      is_nsfw: false,
      media_urls: ['https://images.unsplash.com/photo-1513364776144-60967b0f800f?q=80&w=1000&auto=format&fit=crop'],
    },
  ];

  let createdCount = 0;
  for (const item of postsData) {
    const existing = await prisma.post.findFirst({
      where: { author_id: user.id, content: item.content, deleted_at: null },
      select: { id: true },
    });

    const post = existing
      ? await prisma.post.update({
          where: { id: existing.id },
          data: {
            category: item.category,
            is_nsfw: item.is_nsfw,
            media_urls: item.media_urls,
          },
        })
      : await prisma.post.create({
          data: {
            content: item.content,
            category: item.category,
            is_nsfw: item.is_nsfw,
            media_urls: item.media_urls,
            author_id: user.id,
          },
        });

    await prisma.postTag.deleteMany({ where: { post_id: post.id } });

    for (const rawTag of item.tags) {
      const name = rawTag.trim().toLowerCase();
      if (!name) continue;

      const tag = await prisma.tag.upsert({
        where: { name },
        update: {},
        create: { name },
      });

      await prisma.postTag.create({
        data: {
          post_id: post.id,
          tag_id: tag.id,
        },
      });
    }

    if (!existing) createdCount += 1;
  }

  console.log(`Seed complete. New posts: ${createdCount}, total samples: ${postsData.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
