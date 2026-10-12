import { describe, it, expect, beforeEach } from 'vitest';
import { prisma, resetDb, api } from './helpers.js';

describe('ads: счётчики показов и кликов', () => {
  beforeEach(resetDb);

  it('показы и клики не растут у неодобренной рекламы', async () => {
    const ad = await prisma.advertisement.create({ data: { title: 'Pending', link_url: 'https://example.com', status: 'pending' } as any });

    await api('POST', `/api/admin/ads/${ad.id}/impression`);
    await api('POST', `/api/admin/ads/${ad.id}/click`);

    const after = await prisma.advertisement.findUnique({ where: { id: ad.id }, select: { impressions: true, clicks: true } });
    expect(after?.impressions).toBe(0);
    expect(after?.clicks).toBe(0);
  });

  it('показы и клики считаются у активной рекламы в окне показа', async () => {
    const ad = await prisma.advertisement.create({ data: { title: 'Live', link_url: 'https://example.com', status: 'active' } as any });

    await api('POST', `/api/admin/ads/${ad.id}/impression`);
    await api('POST', `/api/admin/ads/${ad.id}/click`);

    const after = await prisma.advertisement.findUnique({ where: { id: ad.id }, select: { impressions: true, clicks: true } });
    expect(after?.impressions).toBe(1);
    expect(after?.clicks).toBe(1);
  });
});
