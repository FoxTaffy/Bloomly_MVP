import { Pressable, Text, View } from 'react-native';
import { Heart, MessageCircle, UserPlus, AtSign, Repeat2, Bell } from 'lucide-react-native';
import { Avatar } from './Avatar';
import { timeAgo } from '../lib/time';
import type { AppNotification } from '../types/api';

const TYPE_SUFFIX: Record<string, string> = {
  LIKE: 'оценил(а) твой пост',
  REPAW: 'сделал(а) RePaw твоего поста',
  COMMENT: 'прокомментировал(а) твой пост',
  MENTION: 'упомянул(а) тебя',
  FOLLOW: 'подписался(лась) на тебя',
  FRIEND_REQUEST: 'хочет добавить тебя в друзья',
  FRIEND_ACCEPT: 'принял(а) заявку в друзья',
  RELATIONSHIP_REQUEST: 'хочет быть твоим партнёром',
  RELATIONSHIP_ACCEPTED: 'принял(а) предложение',
};

const TYPE_ICON: Record<string, any> = {
  LIKE: Heart,
  REPAW: Repeat2,
  COMMENT: MessageCircle,
  MENTION: AtSign,
  FOLLOW: UserPlus,
  FRIEND_REQUEST: UserPlus,
  RELATIONSHIP_REQUEST: Heart,
};

export function NotificationRow({
  notification,
  onAccept,
  onDecline,
}: {
  notification: AppNotification;
  onAccept?: () => void;
  onDecline?: () => void;
}) {
  const name = notification.sender?.display_name ?? notification.sender?.username ?? 'Кто-то';
  const suffix = TYPE_SUFFIX[notification.type] ?? notification.type;
  const Icon = TYPE_ICON[notification.type] ?? Bell;
  const isRelationshipRequest = notification.type === 'RELATIONSHIP_REQUEST';

  return (
    <View className={`flex-row items-start gap-3 border-b border-brand-border px-4 py-3 ${!notification.read ? 'bg-brand-accent-plus-plus/30' : ''}`}>
      <View>
        <Avatar uri={notification.sender?.avatar_url} name={name} size={40} />
        <View className="absolute -bottom-1 -right-1 h-5 w-5 items-center justify-center rounded-full bg-brand-card">
          <Icon size={12} color="#4C67CF" />
        </View>
      </View>
      <View className="flex-1">
        <Text className="text-brand-offwhite">
          <Text className="font-bold">{name}</Text> {suffix}
        </Text>
        <Text className="mt-0.5 text-xs text-brand-muted">{timeAgo(notification.created_at)}</Text>
        {isRelationshipRequest ? (
          <View className="mt-2 flex-row gap-2">
            <Pressable onPress={onAccept} className="rounded-full bg-brand-accent px-3 py-1.5">
              <Text className="text-xs font-bold text-brand-offwhite">Принять</Text>
            </Pressable>
            <Pressable onPress={onDecline} className="rounded-full bg-brand-card px-3 py-1.5">
              <Text className="text-xs font-bold text-brand-muted">Позже</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}
