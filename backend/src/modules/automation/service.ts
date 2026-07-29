import prisma from '../../config/prisma.js';
import type { UpdateAutomationInput } from './types.js';

// Never mixed into users/service.ts's PUBLIC_SELECT — these are private to the owner only.
const AUTOMATION_SELECT = {
  auto_follow_back:    true,
  mute_keywords:       true,
  quiet_hours_enabled: true,
  quiet_hours_from:    true,
  quiet_hours_to:      true,
  notify_new_fan:      true,
  notify_comment:      true,
  notify_repaw:        true,
  filter_spam:         true,
} as const;

export const automationService = {
  async getSettings(userId: string) {
    return prisma.user.findUnique({ where: { id: userId, deleted_at: null }, select: AUTOMATION_SELECT });
  },

  async updateSettings(userId: string, data: UpdateAutomationInput) {
    return prisma.user.update({
      where: { id: userId, deleted_at: null },
      data: data as any,
      select: AUTOMATION_SELECT,
    });
  },
};
