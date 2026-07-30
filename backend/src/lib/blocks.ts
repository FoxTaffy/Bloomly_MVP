import prisma from '../config/prisma.js';

/**
 * IDs of users on either side of a block relationship with `viewerId` — i.e. users who
 * blocked the viewer, AND users the viewer blocked themselves. Content from any of these
 * IDs should stay hidden from that viewer's feeds (blocking is meant to hide content in
 * both directions, not just from the blocker's perspective).
 */
export async function getBlockerIds(viewerId?: string): Promise<string[]> {
  if (!viewerId) return [];
  const rows = await prisma.block.findMany({
    where: { OR: [{ blocked_id: viewerId }, { blocker_id: viewerId }] },
    select: { blocker_id: true, blocked_id: true },
  });
  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.blocker_id === viewerId ? r.blocked_id : r.blocker_id);
  }
  return [...ids];
}

/** True if `targetId` has blocked `viewerId`. */
export async function isBlockedBy(targetId: string, viewerId?: string): Promise<boolean> {
  if (!viewerId || viewerId === targetId) return false;
  const row = await prisma.block.findUnique({
    where: { blocker_id_blocked_id: { blocker_id: targetId, blocked_id: viewerId } },
  });
  return !!row;
}
