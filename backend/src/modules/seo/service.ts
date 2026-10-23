import prisma from '../../config/prisma.js'
import { readableGroupsWhere, readablePostsWhere, readableProfilesWhere, UUID_PATTERN } from '../../lib/contentAccess.js'

export const SITEMAP_PAGE_SIZE = 10000

// Only what a logged-out visitor can really open: everyone-visible profiles, public SFW posts/groups.
const SITEMAP_USER_WHERE = { deleted_at: null, profile_visibility: 'everyone' }
const SITEMAP_POST_WHERE = {
  deleted_at: null,
  is_nsfw: false,
  is_archived: false,
  subscriber_only: false,
  is_paid: false,
  author: { deleted_at: null, profile_visibility: 'everyone' },
}
const SITEMAP_GROUP_WHERE = { deleted_at: null, is_public: true, is_nsfw: false }

// Public data for the sitemap and the OpenGraph previews served to link-unfurling bots.
export const seoService = {
  sitemapCounts() {
    return Promise.all([
      prisma.user.count({ where: SITEMAP_USER_WHERE }),
      prisma.post.count({ where: SITEMAP_POST_WHERE }),
      prisma.group.count({ where: SITEMAP_GROUP_WHERE }),
    ]).then(([users, posts, groups]) => ({ users, posts, groups }))
  },

  sitemapUsers(page: number) {
    return prisma.user.findMany({
      where: { AND: [readableProfilesWhere(), SITEMAP_USER_WHERE] },
      select: { username: true, updated_at: true },
      orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
      skip: page * SITEMAP_PAGE_SIZE,
      take: SITEMAP_PAGE_SIZE,
    })
  },

  async sitemapPosts(page: number) {
    return prisma.post.findMany({
      where: { AND: [await readablePostsWhere(), SITEMAP_POST_WHERE] },
      select: { id: true, updated_at: true, media_urls: true },
      orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
      skip: page * SITEMAP_PAGE_SIZE,
      take: SITEMAP_PAGE_SIZE,
    })
  },

  sitemapGroups(page: number) {
    return prisma.group.findMany({
      where: { AND: [readableGroupsWhere(), SITEMAP_GROUP_WHERE] },
      select: { slug: true, id: true, updated_at: true },
      orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
      skip: page * SITEMAP_PAGE_SIZE,
      take: SITEMAP_PAGE_SIZE,
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
        is_nsfw: true,
        is_archived: true,
        subscriber_only: true,
        is_paid: true,
        author: { select: { display_name: true, username: true, avatar_url: true, profile_visibility: true } },
      },
    })
  },

  profileForOg(username: string) {
    return prisma.user.findFirst({
      where: { username, AND: [readableProfilesWhere()] },
      select: { display_name: true, username: true, bio: true, avatar_url: true, profile_visibility: true },
    })
  },

  // Лот виден гостю только активным или проданным и не NSFW — те же правила, что у страницы лота.
  listingForOg(id: string) {
    if (!UUID_PATTERN.test(id)) return null
    return prisma.dealerListing.findFirst({
      where: { id, deleted_at: null, status: { in: ['active', 'sold'] }, is_nsfw: false },
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        currency: true,
        images: true,
        status: true,
        listing_kind: true,
        commission_slots_total: true,
        commission_slots_taken: true,
        seller: { select: { display_name: true, username: true } },
      },
    })
  },

  groupForOg(slugOrId: string) {
    return prisma.group.findFirst({
      where: {
        AND: [readableGroupsWhere()],
        ...(UUID_PATTERN.test(slugOrId) ? { id: slugOrId } : { slug: slugOrId }),
      },
      select: { id: true, slug: true, name: true, description: true, avatar_url: true, is_public: true, is_nsfw: true, _count: { select: { members: true } } },
    })
  },
}
