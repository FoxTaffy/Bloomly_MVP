import { Pressable, Text, View } from 'react-native';
import { Mic } from 'lucide-react-native';
import { Avatar } from './Avatar';
import { timeAgo } from '../lib/time';
import type { Conversation } from '../types/api';
import { useSession } from '../stores/session';

export function ConversationRow({ conversation, onPress }: { conversation: Conversation; onPress: () => void }) {
  const myId = useSession((s) => s.user?.id);
  const other = conversation.is_group
    ? null
    : conversation.participants.find((p) => p.id !== myId) ?? conversation.participants[0];

  const title = conversation.is_group ? conversation.name ?? 'Группа' : other?.display_name ?? other?.username ?? '—';
  const avatarUri = conversation.is_group ? conversation.avatar_url : other?.avatar_url;
  const last = conversation.last_message;

  const preview =
    last?.type === 'voice' || last?.type === 'audio'
      ? '🎤 Голосовое'
      : last?.encrypted_text && !last.text
        ? '🔒 Зашифрованное сообщение'
        : (last?.text ?? 'Нет сообщений');

  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 border-b border-brand-border px-4 py-3">
      <Avatar uri={avatarUri} name={title} size={48} />
      <View className="flex-1">
        <View className="flex-row items-center justify-between">
          <Text className="font-bold text-brand-offwhite" numberOfLines={1}>
            {title}
          </Text>
          {last ? <Text className="text-xs text-brand-muted">{timeAgo(last.created_at)}</Text> : null}
        </View>
        <View className="mt-0.5 flex-row items-center justify-between">
          <View className="mr-2 flex-1 flex-row items-center gap-1">
            {last?.type === 'voice' || last?.type === 'audio' ? <Mic size={12} color="#3A4060" /> : null}
            <Text className="flex-1 text-sm text-brand-muted" numberOfLines={1}>
              {preview}
            </Text>
          </View>
          {conversation.unread_count > 0 ? (
            <View className="min-w-[20px] items-center justify-center rounded-full bg-brand-accent px-1.5 py-0.5">
              <Text className="text-[11px] font-bold text-brand-offwhite">{conversation.unread_count}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
