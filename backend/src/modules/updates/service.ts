import prisma from '../../config/prisma.js';

export const updatesService = {
  async getActiveUpdates() {
    return prisma.bloomlyUpdate.findMany({
      where: { is_active: true },
      orderBy: { created_at: 'desc' },
    });
  },

  async getAllUpdates() {
    return prisma.bloomlyUpdate.findMany({
      orderBy: { created_at: 'desc' },
    });
  },

  async createUpdate(data: { title: string; body?: string; image_url?: string }) {
    return prisma.bloomlyUpdate.create({ data });
  },

  async deleteUpdate(id: string) {
    return prisma.bloomlyUpdate.delete({ where: { id } });
  },

  async toggleUpdate(id: string, is_active: boolean) {
    return prisma.bloomlyUpdate.update({ where: { id }, data: { is_active } });
  },
};
