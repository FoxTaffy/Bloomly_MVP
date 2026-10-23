/**
 * SEO Module — Bloomly
 *
 * Endpoints:
 *  GET /sitemap.xml            — sitemap-index
 *  GET /sitemap-static.xml     — статические публичные страницы
 *  GET /sitemap-{profiles|posts|groups}-:n.xml — публичный контент, по SITEMAP_PAGE_SIZE URL в файле
 *  GET /og/post/:id            — HTML с контентом и OG-тегами поста (боты-превьюшки и поисковые краулеры;
 *  GET /og/profile/:username     nginx направляет их сюда по User-Agent)
 *  GET /og/group/:slugOrId     — то же для группы
 *  GET /og/listing/:id         — то же для лота Dealers' Den
 *  Несуществующий / закрытый объект → настоящий 404 (а не soft-404 с оболочкой SPA).
 */

import type { FastifyInstance, FastifyReply } from 'fastify'
import { seoService, SITEMAP_PAGE_SIZE } from './service.js'

const BASE_URL = 'https://bloomly.fun'

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function htmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildOgHtml(opts: {
  title: string
  description: string
  image?: string
  url: string
  type?: string
  robots?: string
  jsonLd?: Record<string, unknown>
}): string {
  const { title, description, image, url, type = 'website', robots = 'index, follow', jsonLd } = opts
  const safeTitle = htmlEscape(title)
  const safeDesc = htmlEscape(description.slice(0, 200))
  const safeImage = image ? htmlEscape(image) : `${BASE_URL}/og-default.png`
  const safeUrl = htmlEscape(url)
  // "</" в JSON-LD закрыл бы <script> раньше времени (контент пользовательский).
  const ld = jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>\n` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${safeTitle} — Bloomly</title>
<meta name="description" content="${safeDesc}"/>
<meta name="robots" content="${htmlEscape(robots)}"/>
<link rel="canonical" href="${safeUrl}"/>
<meta property="og:title" content="${safeTitle}"/>
<meta property="og:description" content="${safeDesc}"/>
<meta property="og:type" content="${type}"/>
<meta property="og:url" content="${safeUrl}"/>
<meta property="og:image" content="${safeImage}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:site_name" content="Bloomly"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${safeTitle}"/>
<meta name="twitter:description" content="${safeDesc}"/>
<meta name="twitter:image" content="${safeImage}"/>
${ld}</head>
<body>
<main>
<h1>${safeTitle}</h1>
<p>${safeDesc}</p>
<p><a href="${safeUrl}">${safeUrl}</a></p>
</main>
</body>
</html>`
}

import { firstVisualMedia } from '../../lib/postMedia.js';
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif)(\?|$)/i

function urlEntry(loc: string, opts: { lastmod?: Date; changefreq?: string; priority?: string; image?: string } = {}): string {
  const { lastmod, changefreq, priority, image } = opts
  return `  <url>\n    <loc>${xmlEscape(loc)}</loc>`
    + (lastmod ? `\n    <lastmod>${lastmod.toISOString()}</lastmod>` : '')
    + (changefreq ? `\n    <changefreq>${changefreq}</changefreq>` : '')
    + (priority ? `\n    <priority>${priority}</priority>` : '')
    + (image ? `\n    <image:image><image:loc>${xmlEscape(image)}</image:loc></image:image>` : '')
    + '\n  </url>'
}

function urlset(entries: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries.join('\n')}\n</urlset>`
}

export async function seoRoutes(fastify: FastifyInstance): Promise<void> {
  function sendXml(reply: FastifyReply, xml: string) {
    reply.header('Content-Type', 'application/xml; charset=utf-8')
    reply.header('Cache-Control', 'private, no-store')
    return reply.send(xml)
  }

  const pages = (count: number) => Math.max(1, Math.ceil(count / SITEMAP_PAGE_SIZE))

  // ── Sitemap index ────────────────────────────────────────────────────────
  fastify.get('/sitemap.xml', async (_req, reply) => {
    const counts = await seoService.sitemapCounts()
    const files = ['sitemap-static.xml']
    for (const kind of ['profiles', 'posts', 'groups'] as const) {
      const n = counts[kind === 'profiles' ? 'users' : kind]
      if (n === 0) continue
      for (let i = 1; i <= pages(n); i++) files.push(`sitemap-${kind}-${i}.xml`)
    }
    const items = files.map(f => `  <sitemap>\n    <loc>${BASE_URL}/${f}</loc>\n  </sitemap>`)
    return sendXml(reply, `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join('\n')}\n</sitemapindex>`)
  })

  fastify.get('/sitemap-static.xml', async (_req, reply) => {
    const staticUrls = [
      { loc: BASE_URL, priority: '1.0', changefreq: 'daily' },
      { loc: `${BASE_URL}/groups`, priority: '0.8', changefreq: 'daily' },
      { loc: `${BASE_URL}/dealers-den`, priority: '0.7', changefreq: 'daily' },
      { loc: `${BASE_URL}/terms`, priority: '0.2', changefreq: 'yearly' },
      { loc: `${BASE_URL}/privacy`, priority: '0.2', changefreq: 'yearly' },
    ]
    return sendXml(reply, urlset(staticUrls.map(({ loc, ...o }) => urlEntry(loc, o))))
  })

  fastify.get<{ Params: { kind: string; n: string } }>('/sitemap-:kind-:n.xml', async (req, reply) => {
    const page = Number(req.params.n) - 1
    if (!Number.isInteger(page) || page < 0) return reply.status(404).send('Not found')

    if (req.params.kind === 'profiles') {
      const users = await seoService.sitemapUsers(page)
      return sendXml(reply, urlset(users.map(u =>
        urlEntry(`${BASE_URL}/profile/${u.username}`, { lastmod: u.updated_at, changefreq: 'weekly', priority: '0.7' }))))
    }
    if (req.params.kind === 'posts') {
      const posts = await seoService.sitemapPosts(page)
      return sendXml(reply, urlset(posts.map(p => {
        const img = (p.media_urls ?? []).find(m => IMAGE_EXT.test(String(m)))
        return urlEntry(`${BASE_URL}/post/${p.id}`, { lastmod: p.updated_at, changefreq: 'monthly', priority: '0.6', image: img ? String(img) : undefined })
      })))
    }
    if (req.params.kind === 'groups') {
      const groups = await seoService.sitemapGroups(page)
      return sendXml(reply, urlset(groups.map(g =>
        urlEntry(`${BASE_URL}/groups/${g.slug || g.id}`, { lastmod: g.updated_at, changefreq: 'weekly', priority: '0.65' }))))
    }
    return reply.status(404).send('Not found')
  })

  // ── Crawler pages ────────────────────────────────────────────────────────
  // Публичный, но неподходящий для индекса контент (NSFW и т.п.) отдаётся с noindex;
  // закрытый или удалённый — 404, как и положено.
  fastify.get<{ Params: { id: string } }>('/og/post/:id', async (req, reply) => {
    const post = await seoService.postForOg(req.params.id)
    if (!post || post.author?.profile_visibility !== 'everyone' || post.subscriber_only || post.is_paid) {
      return reply.status(404).header('X-Robots-Tag', 'noindex').send('Not found')
    }

    const authorName = post.author?.display_name || post.author?.username || 'A user'
    const title = `${authorName} on Bloomly`
    const description = post.is_nsfw
      ? `A post by ${authorName} on Bloomly.`
      : (post.content ? post.content.slice(0, 200).replace(/\n/g, ' ') : `A post by ${authorName} on Bloomly.`)
    const image = !post.is_nsfw ? firstVisualMedia(post.media_urls) : undefined // вложение-файл не может быть картинкой превью
    const url = `${BASE_URL}/post/${post.id}`
    const noindex = post.is_nsfw || post.is_archived

    reply.header('Content-Type', 'text/html; charset=utf-8')
    reply.header('Cache-Control', 'public, max-age=600')
    return reply.send(buildOgHtml({
      title, description, image, url, type: 'article',
      robots: noindex ? 'noindex, follow' : 'index, follow',
      jsonLd: noindex ? undefined : {
        '@context': 'https://schema.org',
        '@type': 'SocialMediaPosting',
        url,
        headline: title,
        articleBody: description,
        datePublished: post.created_at.toISOString(),
        author: { '@type': 'Person', name: authorName, url: `${BASE_URL}/profile/${post.author?.username}` },
        ...(image ? { image } : {}),
      },
    }))
  })

  fastify.get<{ Params: { username: string } }>('/og/profile/:username', async (req, reply) => {
    const user = await seoService.profileForOg(req.params.username)
    if (!user || user.profile_visibility !== 'everyone') {
      return reply.status(404).header('X-Robots-Tag', 'noindex').send('Not found')
    }

    const name = user.display_name || user.username
    const title = `${name} (@${user.username})`
    const description = user.bio
      ? user.bio.slice(0, 200)
      : `${name}'s profile on Bloomly — the creative social network.`
    const url = `${BASE_URL}/profile/${user.username}`

    reply.header('Content-Type', 'text/html; charset=utf-8')
    reply.header('Cache-Control', 'public, max-age=600')
    return reply.send(buildOgHtml({
      title, description, image: user.avatar_url ?? undefined, url, type: 'profile',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        mainEntity: { '@type': 'Person', name, alternateName: user.username, url, ...(user.avatar_url ? { image: user.avatar_url } : {}) },
      },
    }))
  })

  // Превью лота: название — заголовок, в описании сначала цена и слоты, потом текст лота.
  fastify.get<{ Params: { id: string } }>('/og/listing/:id', async (req, reply) => {
    const listing = await seoService.listingForOg(req.params.id)
    if (!listing) {
      return reply.status(404).header('X-Robots-Tag', 'noindex').send('Not found')
    }

    const sellerName = listing.seller?.display_name || listing.seller?.username || 'a seller'
    const price = Number(listing.price)
    const priceLine = price > 0 ? `${price} ${listing.currency}` : 'Free'
    const slotsLine = listing.commission_slots_total != null
      ? `${listing.commission_slots_total - listing.commission_slots_taken} of ${listing.commission_slots_total} slots open`
      : null
    const soldLine = listing.status === 'sold' ? 'Sold' : null
    const header = [soldLine, priceLine, slotsLine].filter(Boolean).join(' · ')
    const body = listing.description?.replace(/\s+/g, ' ').trim()
    const description = body ? `${header} — ${body}` : `${header} — by ${sellerName} on Bloomly's Dealers' Den.`
    const image = Array.isArray(listing.images) && listing.images.length > 0 ? String(listing.images[0]) : undefined
    const url = `${BASE_URL}/dealers-den/${listing.id}`

    reply.header('Content-Type', 'text/html; charset=utf-8')
    reply.header('Cache-Control', 'public, max-age=600')
    return reply.send(buildOgHtml({
      title: listing.title, description, image, url, type: 'product',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: listing.title,
        description,
        url,
        ...(image ? { image } : {}),
        offers: {
          '@type': 'Offer',
          price: String(price),
          priceCurrency: listing.currency,
          availability: listing.status === 'sold' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
          url,
        },
      },
    }))
  })

  fastify.get<{ Params: { slugOrId: string } }>('/og/group/:slugOrId', async (req, reply) => {
    const group = await seoService.groupForOg(req.params.slugOrId)
    if (!group || !group.is_public) {
      return reply.status(404).header('X-Robots-Tag', 'noindex').send('Not found')
    }

    const seg = group.slug || group.id
    const membersStr = group._count.members ? ` · ${group._count.members} members` : ''
    const description = group.description
      ? group.description.slice(0, 200)
      : `${group.name} — a community on Bloomly${membersStr}.`
    const url = `${BASE_URL}/groups/${seg}`

    reply.header('Content-Type', 'text/html; charset=utf-8')
    reply.header('Cache-Control', 'public, max-age=600')
    return reply.send(buildOgHtml({
      title: group.name, description, image: group.avatar_url ?? undefined, url,
      robots: group.is_nsfw ? 'noindex, follow' : 'index, follow',
      jsonLd: group.is_nsfw ? undefined : {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: group.name,
        url,
        description,
        ...(group.avatar_url ? { primaryImageOfPage: { '@type': 'ImageObject', url: group.avatar_url } } : {}),
      },
    }))
  })
}
