import prisma from '../config/prisma.js';

/** IDs of users who have blocked `viewerId` — their content should stay hidden from that viewer. */
export async function getBlockerIds(viewerId?: string): Promise<string[]> {
  if (!viewerId) return [];
  const rows = await prisma.block.findMany({ where: { blocked_id: viewerId }, select: { blocker_id: true } });
  return rows.map((r) => r.blocker_id);
}

/** True if `targetId` has blocked `viewerId`. */
export async function isBlockedBy(targetId: string, viewerId?: string): Promise<boolean> {
  if (!viewerId || viewerId === targetId) return false;
  const row = await prisma.block.findUnique({
    where: { blocker_id_blocked_id: { blocker_id: targetId, blocked_id: viewerId } },
  });
  return !!row;
}
