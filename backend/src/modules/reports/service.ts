import prisma from '../../config/prisma.js';

export const reportService = {
  async createReport(data: { reporterId: string; targetType: 'user' | 'post' | 'comment'; targetId: string; reason: string }) {
    const { reporterId, targetType, targetId, reason } = data;
    return await prisma.report.create({
      data: {
        reporter_id: reporterId,
        target_type: targetType,
        target_id: targetId,
        reason,
      },
    });
  },
};
