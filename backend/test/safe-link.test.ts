import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeSafeLink, requireSafeLink, sanitizeLinkRecord } from '../src/lib/safeLink.js';
import { createUser, resetDb, api, prisma } from './helpers.js';

describe('safeLink: схемы ссылок', () => {
  it('разрешает http, https, mailto, tel и ссылки без схемы', () => {
    expect(normalizeSafeLink('https://example.com/a')).toBe('https://example.com/a');
    expect(normalizeSafeLink('http://example.com')).toBe('http://example.com/');
    expect(normalizeSafeLink('mailto:team@example.com')).toBe('mailto:team@example.com');
    expect(normalizeSafeLink('tel:+70000000000')).toBe('tel:+70000000000');
    expect(normalizeSafeLink('t.me/bloomly')).toBe('https://t.me/bloomly');
  });

  it('отклоняет javascript:, data:, vbscript: и обход через пробелы/табы', () => {
    expect(normalizeSafeLink("javascript:fetch('/x')")).toBeNull();
    expect(normalizeSafeLink('JavaScript:alert(1)')).toBeNull();
    expect(normalizeSafeLink('  javascript:alert(1)')).toBeNull();
    expect(normalizeSafeLink('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(normalizeSafeLink('vbscript:msgbox(1)')).toBeNull();
    const tricky = normalizeSafeLink('java\tscript:alert(1)');
    expect(tricky === null || !tricky.startsWith('javascript:')).toBe(true);
  });

  it('requireSafeLink: пусто → null, плохое → ошибка с названием поля', () => {
    expect(requireSafeLink('   ', 'сайт')).toBeNull();
    expect(requireSafeLink(undefined, 'сайт')).toBeNull();
    expect(() => requireSafeLink('javascript:alert(1)', 'сайт')).toThrow('сайт');
  });

  it('sanitizeLinkRecord: пустые значения отбрасываются, опасные — ошибка', () => {
    expect(sanitizeLinkRecord({ site: 'example.com', tg: '' })).toEqual({ site: 'https://example.com/' });
    expect(() => sanitizeLinkRecord({ site: 'javascript:alert(1)' })).toThrow();
  });
});

describe('ads: ссылка рекламы проходит проверку на записи', () => {
  beforeEach(resetDb);

  it('javascript: в ссылке рекламы отклоняется с 400', async () => {
    const { auth } = await createUser({ subscription_tier: 'business' });
    const res = await api('POST', '/api/admin/ads', {
      headers: auth,
      body: { title: 'Реклама', linkUrl: "javascript:fetch('/api/auth/refresh')", placement: 'feed_top', billing: 'week', periods: 1 },
    });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('INVALID_AD_LINK');
    expect(await prisma.advertisement.count()).toBe(0);
  });
});
