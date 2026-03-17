/**
 * SEO Module — Bloomly
 *
 * Endpoints:
 *  GET /sitemap.xml   — динамический XML-sitemap (публичные страницы)
 *  GET /og/post/:id   — минимальный HTML с OG-тегами для поста (для ботов Telegram/VK/etc)
 *  GET /og/profile/:username — минимальный HTML с OG-тегами для профиля
 *  GET /og/group/:slugOrId   — минимальный HTML с OG-тегами для группы
 */

import type { FastifyInstance } from 'fastify'
import prisma from '../../config/prisma.js'

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
  redirectUrl?: string
}): string {
  const { title, description, image, url, type = 'website', redirectUrl } = opts
  const safeTitle = htmlEscape(title)
  const safeDesc = htmlEscape(description.slice(0, 200))
  const safeImage = image ? htmlEscape(image) : `${BASE_URL}/og-default.png`
  const safeUrl = htmlEscape(url)
  const canonicalRedirect = redirectUrl || url

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${safeTitle} — Bloomly</title>
<meta name="description" content="${safeDesc}"/>
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
<meta http-equiv="refresh" content="0;url=${htmlEscape(canonicalRedirect)}"/>
</head>
<body>
<p>Загрузка… <a href="${htmlEscape(canonicalRedirect)}">Нажмите, если перенаправление не сработало</a></p>
</body>
</html>`
}

export async function seoRoutes(fastify: FastifyInstance): Promise<void> {
  // ── Sitemap ──────────────────────────────────────────────────────────────
  fastify.get('/sitemap.xml', async (_req, reply) => {
    // Публичные статические URL
    const staticUrls = [
      { loc: BASE_URL, priority: '1.0', changefreq: 'daily' },
      { loc: `${BASE_URL}/login`, priority: '0.5', changefreq: 'monthly' },
      { loc: `${BASE_URL}/groups`, priority: '0.8', changefreq: 'daily' },
      { loc: `${BASE_URL}/dealers-den`, priority: '0.7', changefreq: 'daily' },
    ]

    // Публичные профили
    const users = await prisma.user.findMany({
      where: { deleted_at: null },
      select: { username: true, updated_at: true },
      orderBy: { updated_at: 'desc' },
      take: 5000,
    })

    // Публичные посты (не NSFW, не удалённые)
    const posts = await prisma.post.findMany({
      where: { deleted_at: null, is_nsfw: false },
      select: { id: true, updated_at: true },
      orderBy: { updated_at: 'desc' },
      take: 10000,
    })

    // Публичные группы
    const groups = await prisma.group.findMany({
      where: { deleted_at: null },
      select: { slug: true, id: true, updated_at: true },
      orderBy: { updated_at: 'desc' },
      take: 2000,
    })

    const urls: string[] = [...staticUrls.map(({ loc, priority, changefreq }) =>
      `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`
    )]

    for (const u of users) {
      const lastmod = u.updated_at.toISOString().split('T')[0]
      urls.push(`  <url>\n    <loc>${xmlEscape(`${BASE_URL}/profile/${u.username}`)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`)
    }

    for (const p of posts) {
      const lastmod = p.updated_at.toISOString().split('T')[0]
      urls.push(`  <url>\n    <loc>${xmlEscape(`${BASE_URL}/post/${p.id}`)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`)
    }

    for (const g of groups) {
      const seg = g.slug || g.id
      const lastmod = g.updated_at.toISOString().split('T')[0]
      urls.push(`  <url>\n    <loc>${xmlEscape(`${BASE_URL}/groups/${seg}`)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.65</priority>\n  </url>`)
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`

    reply.header('Content-Type', 'application/xml; charset=utf-8')
    reply.header('Cache-Control', 'public, max-age=3600')
    return reply.send(xml)
  })

  // ── OG Proxy: Post ───────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/og/post/:id', async (req, reply) => {
    const { id } = req.params
    const post = await prisma.post.findFirst({
      where: { id, deleted_at: null },
      select: {
        id: true,
        content: true,
        media_urls: true,
        created_at: true,
        author: { select: { display_name: true, username: true, avatar_url: true } },
      },
    })

    if (!post) {
      return reply.status(404).send('Not found')
    }

    const authorName = post.author?.display_name || post.author?.username || 'Пользователь'
    const title = `${authorName} на Bloomly`
    const description = post.content
      ? post.content.slice(0, 200).replace(/\n/g, ' ')
      : `Публикация от ${authorName} в Bloomly.`
    const image = (post.media_urls && Array.isArray(post.media_urls) && post.media_urls.length > 0)
      ? String(post.media_urls[0])
      : undefined
    const url = `${BASE_URL}/post/${post.id}`

    reply.header('Content-Type', 'text/html; charset=utf-8')
    reply.header('Cache-Control', 'public, max-age=600')
    return reply.send(buildOgHtml({ title, description, image, url, type: 'article', redirectUrl: url }))
  })

  // ── OG Proxy: Profile ────────────────────────────────────────────────────
  fastify.get<{ Params: { username: string } }>('/og/profile/:username', async (req, reply) => {
    const { username } = req.params
    const user = await prisma.user.findFirst({
      where: { username, deleted_at: null },
      select: { display_name: true, username: true, bio: true, avatar_url: true },
    })

    if (!user) {
      return reply.status(404).send('Not found')
    }

    const name = user.display_name || user.username
    const title = `${name} (@${user.username})`
    const description = user.bio
      ? user.bio.slice(0, 200)
      : `Профиль ${name} на Bloomly — творческой социальной сети.`
    const url = `${BASE_URL}/profile/${user.username}`

    reply.header('Content-Type', 'text/html; charset=utf-8')
    reply.header('Cache-Control', 'public, max-age=600')
    return reply.send(buildOgHtml({ title, description, image: user.avatar_url ?? undefined, url, type: 'profile', redirectUrl: url }))
  })

  // ── OG Proxy: Group ──────────────────────────────────────────────────────
  fastify.get<{ Params: { slugOrId: string } }>('/og/group/:slugOrId', async (req, reply) => {
    const { slugOrId } = req.params
    const group = await prisma.group.findFirst({
      where: {
        deleted_at: null,
        OR: [{ slug: slugOrId }, { id: slugOrId }],
      },
      select: { id: true, slug: true, name: true, description: true, avatar_url: true, _count: { select: { members: true } } },
    })

    if (!group) {
      return reply.status(404).send('Not found')
    }

    const seg = group.slug || group.id
    const membersStr = group._count.members ? ` · ${group._count.members} участников` : ''
    const description = group.description
      ? group.description.slice(0, 200)
      : `Сообщество ${group.name} на Bloomly${membersStr}.`
    const url = `${BASE_URL}/groups/${seg}`

    reply.header('Content-Type', 'text/html; charset=utf-8')
    reply.header('Cache-Control', 'public, max-age=600')
    return reply.send(buildOgHtml({ title: group.name, description, image: group.avatar_url ?? undefined, url, redirectUrl: url }))
  })
}
