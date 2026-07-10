import { followsService } from '../modules/follows/service.js';

/** Shared "who can X" privacy levels. Not every field uses every value (e.g. profile/friends-list use 'only_me' instead of 'nobody'). */
export type PrivacyLevel = 'everyone' | 'friends' | 'nobody' | 'only_me';

/**
 * Check whether `viewerId` is allowed to act on/see something owned by `ownerId`,
 * given the owner's chosen privacy level. The owner is always allowed on their own content.
 */
export async function isAllowedByPrivacy(
  level: string | null | undefined,
  ownerId: string,
  viewerId?: string,
): Promise<boolean> {
  if (viewerId === ownerId) return true;
  switch (level) {
    case 'everyone':
      return true;
    case 'nobody':
    case 'only_me':
      return false;
    case 'friends': {
      if (!viewerId) return false;
      const { friends } = await followsService.isFriends(viewerId, ownerId);
      return friends;
    }
    default:
      return true;
  }
}
