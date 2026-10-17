import prisma from '../../config/prisma.js'
import { readableGroupsWhere, readablePostsWhere, readableProfilesWhere, UUID_PATTERN } from '../../lib/contentAccess.js'

// Public data for the sitemap and the OpenGraph previews served to link-unfurling bots.
export const seoService = {
  sitemapUsers() {
    return prisma.user.findMany({
      where: readableProfilesWhere(),
      select: { username: true, updated_at: true },
      orderBy: { updated_at: 'desc' },
      take: 5000,
    })
  },

  async sitemapPosts() {
    return prisma.post.findMany({
      where: { AND: [await readablePostsWhere()], is_nsfw: false, is_archived: false },
      select: { id: true, updated_at: true },
      orderBy: { updated_at: 'desc' },
      take: 10000,
    })
  },

  sitemapGroups() {
    return prisma.group.findMany({
      where: readableGroupsWhere(),
      select: { slug: true, id: true, updated_at: true },
      orderBy: { updated_at: 'desc' },
      take: 2000,
    })
  },

  async postForOg(id: string) {
    if (!UUID_PATTERN.test(id)) return null
    return prisma.post.findFirst({
      where: { id, AND: [await readablePostsWhere()], is_nsfw: false, is_archived: false },
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
      where: { username, AND: [readableProfilesWhere()] },
      select: { display_name: true, username: true, bio: true, avatar_url: true },
    })
  },

  groupForOg(slugOrId: string) {
    return prisma.group.findFirst({
      where: {
        AND: [readableGroupsWhere()],
        ...(UUID_PATTERN.test(slugOrId) ? { id: slugOrId } : { slug: slugOrId }),
      },
      select: { id: true, slug: true, name: true, description: true, avatar_url: true, _count: { select: { members: true } } },
    })
  },
}
