import prisma from '../../config/prisma.js';

// ── In-memory online status tracking ─────────────────────────────────────────
// Map per user of socket → device label ("Chrome · iPhone"), so multiple
// browser tabs / devices work correctly and the UI can show what someone's on.
const onlineUsers = new Map<string, Map<unknown, string>>();

export const presence = {
  markOnline(userId: string, socket: unknown, deviceLabel: string) {
    let sockets = onlineUsers.get(userId);
    if (!sockets) {
      sockets = new Map();
      onlineUsers.set(userId, sockets);
    }
    sockets.set(socket, deviceLabel);
  },

  // Remove entirely if map becomes empty
  markOffline(userId: string, socket: unknown) {
    const sockets = onlineUsers.get(userId);
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) {
      onlineUsers.delete(userId);
      // Persist so "last seen" survives page reloads / server restarts, not just this session's memory
      prisma.user.update({ where: { id: userId }, data: { last_seen_at: new Date() } }).catch(() => {});
    }
  },

  isOnline(userId: string): boolean {
    const sockets = onlineUsers.get(userId);
    return !!sockets && sockets.size > 0;
  },

  /** Device label of the user's first open socket, or null when offline. */
  deviceOf(userId: string): string | null {
    const sockets = onlineUsers.get(userId);
    return sockets ? ([...sockets.values()][0] ?? null) : null;
  },

  onlineCount(): number {
    return onlineUsers.size;
  },

  onlineIds(): Set<string> {
    return new Set([...onlineUsers.keys()].filter((id) => this.isOnline(id)));
  },
};
