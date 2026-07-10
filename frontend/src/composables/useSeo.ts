/**
 * useSeo — универсальный SEO-composable для Bloomly.
 *
 * Устанавливает:
 *  - <title>
 *  - <meta name="description"> / <meta name="robots">
 *  - Open Graph (og:title, og:description, og:image, og:url, og:type)
 *  - Twitter Card
 *  - <link rel="canonical">
 *  - JSON-LD (опционально)
 */

import { useHead } from '@unhead/vue'

const BASE_URL = 'https://bloomly.fun'
const DEFAULT_IMAGE = `${BASE_URL}/og-default.png`
const SITE_NAME = 'Bloomly'

export interface SeoOptions {
  title?: string
  /** Raw title без суффикса — используется если нужен полный контроль */
  titleRaw?: string
  description?: string
  image?: string
  imageAlt?: string
  url?: string
  type?: 'website' | 'article' | 'profile'
  robots?: string
  /** JSON-LD объект (SocialMediaPosting, ProfilePage, etc.) */
  jsonLd?: Record<string, unknown>
}

/**
 * Строит заголовок страницы: "Текст — Bloomly" или просто "Bloomly"
 */
function buildTitle(title?: string, titleRaw?: string): string {
  if (titleRaw) return titleRaw
  if (title) return `${title} — ${SITE_NAME}`
  return `${SITE_NAME} — Creative Social Network`
}

export function useSeo(options: SeoOptions = {}) {
  const {
    title,
    titleRaw,
    description = 'Bloomly is a creative social network for artists, the furry community, and creative people everywhere. Share art, connect, find your people.',
    image = DEFAULT_IMAGE,
    imageAlt = 'Bloomly',
    url = BASE_URL,
    type = 'website',
    robots = 'index, follow',
    jsonLd,
  } = options

  const fullTitle = buildTitle(title, titleRaw)
  const canonicalUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`
  const ogImage = image.startsWith('http') ? image : `${BASE_URL}${image}`

  const meta: Record<string, string>[] = [
    { name: 'description', content: description },
    { name: 'robots', content: robots },

    // Open Graph
    { property: 'og:title', content: fullTitle },
    { property: 'og:description', content: description },
    { property: 'og:type', content: type },
    { property: 'og:url', content: canonicalUrl },
    { property: 'og:image', content: ogImage },
    { property: 'og:image:alt', content: imageAlt },
    { property: 'og:site_name', content: SITE_NAME },

    // Twitter Card
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: fullTitle },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: ogImage },
  ]

  const link: Record<string, string>[] = [
    { rel: 'canonical', href: canonicalUrl },
  ]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const script: any[] = []
  if (jsonLd) {
    script.push({
      type: 'application/ld+json',
      innerHTML: JSON.stringify(jsonLd),
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useHead({
    title: fullTitle,
    meta,
    link,
    ...(script.length ? { script } : {}),
  } as any)
}

// ─── Конкретные хелперы ──────────────────────────────────────────────────────

export function useProfileSeo(opts: {
  username: string
  displayName: string
  bio?: string
  avatarUrl?: string
}) {
  const { username, displayName, bio, avatarUrl } = opts
  useSeo({
    title: `${displayName} (@${username})`,
    description: bio
      ? `${bio.slice(0, 140)}…`
      : `${displayName}'s profile on Bloomly — the creative social network.`,
    image: avatarUrl,
    imageAlt: displayName,
    url: `${BASE_URL}/profile/${username}`,
    type: 'profile',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      name: displayName,
      url: `${BASE_URL}/profile/${username}`,
      description: bio,
      ...(avatarUrl
        ? { image: { '@type': 'ImageObject', url: avatarUrl } }
        : {}),
    },
  })
}

export function usePostSeo(opts: {
  postId: string
  content?: string
  mediaUrl?: string
  authorName?: string
  authorUsername?: string
  createdAt?: string
}) {
  const { postId, content, mediaUrl, authorName, authorUsername, createdAt } = opts

  const description = content
    ? content.slice(0, 160).replace(/\n/g, ' ')
    : `A post on Bloomly by ${authorName ?? 'a user'}.`

  const title = authorName
    ? `${authorName} on Bloomly`
    : 'Post on Bloomly'

  useSeo({
    title,
    description,
    image: mediaUrl,
    imageAlt: `Post by ${authorName ?? ''}`,
    url: `${BASE_URL}/post/${postId}`,
    type: 'article',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'SocialMediaPosting',
      url: `${BASE_URL}/post/${postId}`,
      description,
      datePublished: createdAt,
      ...(authorName && authorUsername
        ? {
            author: {
              '@type': 'Person',
              name: authorName,
              url: `${BASE_URL}/profile/${authorUsername}`,
            },
          }
        : {}),
      ...(mediaUrl
        ? {
            image: { '@type': 'ImageObject', url: mediaUrl },
            sharedContent: { '@type': 'ImageObject', url: mediaUrl },
          }
        : {}),
    },
  })
}

export function useGroupSeo(opts: {
  groupId: string
  slug?: string
  name: string
  description?: string
  avatarUrl?: string
  membersCount?: number
}) {
  const { groupId, slug, name, description, avatarUrl, membersCount } = opts

  const urlSegment = slug || groupId
  const desc = description
    ? description.slice(0, 160)
    : `${name} — a community on Bloomly. ${membersCount ? `${membersCount} members.` : ''}`

  useSeo({
    title: `${name} — Community`,
    description: desc,
    image: avatarUrl,
    imageAlt: name,
    url: `${BASE_URL}/groups/${urlSegment}`,
    type: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name,
      url: `${BASE_URL}/groups/${urlSegment}`,
      description: desc,
      ...(avatarUrl ? { logo: { '@type': 'ImageObject', url: avatarUrl } } : {}),
      ...(membersCount ? { numberOfEmployees: membersCount } : {}),
    },
  })
}
