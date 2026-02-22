import prisma from '../../config/prisma.js';

export const adminService = {
  async getReports(status?: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    return await prisma.report.findMany({
      where: status ? { status } : {},
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        reporter: { select: { id: true, username: true, display_name: true } },
      },
    });
  },

  async updateReport(reportId: string, status: 'reviewed' | 'rejected') {
    return await prisma.report.update({
      where: { id: reportId },
      data: { status },
    });
  },

  async getUsers(page = 1, limit = 20, role?: string) {
    const skip = (page - 1) * limit;
    return await prisma.user.findMany({
      where: role ? { role } : {},
      skip,
      take: limit,
      select: {
        id: true,
        username: true,
        email: true,
        display_name: true,
        role: true,
        is_blocked: true,
        created_at: true,
        _count: { select: { posts: true, followers: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  },

  async updateUserRole(userId: string, role: 'user' | 'moderator' | 'admin') {
    return await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, username: true, role: true },
    });
  },

  async toggleUserBlock(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('Пользователь не найден');
    return await prisma.user.update({
      where: { id: userId },
      data: { is_blocked: !user.is_blocked },
      select: { id: true, username: true, is_blocked: true },
    });
  },

  async deletePost(postId: string) {
    return await prisma.post.update({
      where: { id: postId },
      data: { deleted_at: new Date() },
    });
  },

  async deleteComment(commentId: string) {
    return await prisma.comment.update({
      where: { id: commentId },
      data: { deleted_at: new Date() },
    });
  },

  async getStats() {
    const [userCount, postCount, commentCount, reportCount] = await Promise.all([
      prisma.user.count({ where: { deleted_at: null } }),
      prisma.post.count({ where: { deleted_at: null } }),
      prisma.comment.count({ where: { deleted_at: null } }),
      prisma.report.count({ where: { status: 'pending' } }),
    ]);
    return { userCount, postCount, commentCount, pendingReports: reportCount };
  },
};
