import prisma from '../../config/prisma.js'

// Public data for the sitemap and the OpenGraph previews served to link-unfurling bots.
export const seoService = {
  sitemapUsers() {
    return prisma.user.findMany({
      where: { deleted_at: null },
      select: { username: true, updated_at: true },
      orderBy: { updated_at: 'desc' },
      take: 5000,
    })
  },

  sitemapPosts() {
    return prisma.post.findMany({
      where: { deleted_at: null, is_nsfw: false },
      select: { id: true, updated_at: true },
      orderBy: { updated_at: 'desc' },
      take: 10000,
    })
  },

  sitemapGroups() {
    return prisma.group.findMany({
      where: { deleted_at: null },
      select: { slug: true, id: true, updated_at: true },
      orderBy: { updated_at: 'desc' },
      take: 2000,
    })
  },

  postForOg(id: string) {
    return prisma.post.findFirst({
      where: { id, deleted_at: null },
      select: {
        id: true,
        content: true,
        media_urls: true,
        created_at: true,
        author: { select: { display_name: true, username: true, avatar_url: true } },
      },
    })
  },

  profileForOg(username: string) {
    return prisma.user.findFirst({
      where: { username, deleted_at: null },
      select: { display_name: true, username: true, bio: true, avatar_url: true },
    })
  },

  groupForOg(slugOrId: string) {
    return prisma.group.findFirst({
      where: {
        deleted_at: null,
        OR: [{ slug: slugOrId }, { id: slugOrId }],
      },
      select: { id: true, slug: true, name: true, description: true, avatar_url: true, _count: { select: { members: true } } },
    })
  },
}
