export interface JwtUser {
  id: string;
}

export type GroupType = 'event' | 'creative' | 'static' | 'news' | 'shop' | 'community' | 'brand';
export type EventStatus = 'announced' | 'tickets_open' | 'sold_out' | 'active' | 'finished' | 'teaser';
export type CommissionStatus = 'open' | 'closed' | 'waitlist';
export type MemberRole = 'owner' | 'admin' | 'moderator' | 'member' | 'dealer' | 'volunteer' | 'guest_of_honor';

export interface CreateGroupInput {
  name: string;
  slug: string;
  type: GroupType;
  description?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  accentColor?: string;
  socialLinks?: Record<string, string>;
  isPublic?: boolean;
  rubric?: string;
}

export interface UpdateGroupInput {
  name?: string;
  slug?: string;
  description?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  accentColor?: string;
  socialLinks?: Record<string, string>;
  isPublic?: boolean;
  rulesText?: string;
  faq?: Array<{ q: string; a: string }>;
  contactPhone?: string;
  contactEmail?: string;
  aboutText?: string;
  schedule?: Array<{ time: string; label: string }>;
  whatToBring?: string[];
  isNsfw?: boolean;
  productionTime?: string;
  deliveryInfo?: string;
  completedWorks?: number;
  guaranteeText?: string;
  category?: string;
  rubric?: string | null;
  isVerified?: boolean;
  groupBgUrl?: string;
  groupFrame?: string;
  groupTheme?: string;
  hideAdmins?: boolean;
  hiddenMemberIds?: string[];
  donationsEnabled?: boolean;
  bankCardMasked?: string | null;
  supportTiers?: Array<{ emoji: string; name: string; price: string; desc: string }>;
  businessEnabled?: boolean;
  welcomeMsgEnabled?: boolean;
  welcomeMsgText?: string;
}

export interface CreateEventInput {
  groupId: string;
  title: string;
  shortCode: string;
  description?: string;
  bannerUrl?: string;
  locationName?: string;
  locationLat?: number;
  locationLng?: number;
  startsAt: string; // ISO
  endsAt: string;   // ISO
  isRecurring?: boolean;
  theme?: Record<string, any>;
  isTop?: boolean;
  registrationUrl?: string;
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  bannerUrl?: string;
  locationName?: string;
  locationLat?: number;
  locationLng?: number;
  startsAt?: string;
  endsAt?: string;
  status?: EventStatus;
  theme?: Record<string, any>;
  isTop?: boolean;
  registrationUrl?: string;
  shortCode?: string;
}

export interface CreateTicketTierInput {
  eventId: string;
  name: string;
  price: number;
  currency?: string;
  totalCount: number;
  saleStartsAt?: string;
  saleEndsAt?: string;
}

export interface UpdateCommissionInput {
  status?: CommissionStatus;
  basePrices?: Record<string, number>;
  currency?: string;
  tosText?: string;
  maxQueue?: number;
  rushSlots?: number;
  rushMax?: number;
  turnaroundDays?: string;
  priceList?: Array<{ name: string; price: number; description?: string }>;
}

export interface GetGroupsQuery {
  type?: GroupType;
  search?: string;
  page?: string;
  limit?: string;
}

export interface RateGroupInput {
  value: number; // -1 (downvote) or 1 (upvote)
}

export interface CreateGroupPostInput {
  content: string;
  title?: string;
  postType?: string;
  isNsfw?: boolean;
  isAnnouncement?: boolean;
  mediaUrls?: string[];
  tags?: string[];
  visibility?: string;
  category?: string;
}

export type RsvpStatus = 'going' | 'maybe' | 'not_going';

export interface RsvpEventInput {
  status: RsvpStatus;
}

export interface SubEventInput {
  title: string;
  type?: string; // panel | workshop | dealer | performance | other
  speaker?: string;
  locationName?: string;
  startsAt: string; // ISO
  endsAt: string;
  description?: string;
}

export interface UpdateSubEventInput {
  title?: string;
  type?: string;
  speaker?: string;
  locationName?: string;
  startsAt?: string;
  endsAt?: string;
  description?: string;
}

export type OrderStatus = 'WAITING' | 'SKETCH' | 'LINEART' | 'COLORING' | 'FINISHED';

export interface CreateOrderInput {
  title: string;
  description?: string;
  formData?: Record<string, unknown>;
  deadlineAt?: string; // ISO
}

export interface UpdateOrderInput {
  status?: OrderStatus;
}
