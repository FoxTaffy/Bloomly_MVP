import { useState } from 'react';
import { View, Text, Pressable, FlatList, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Share2, Settings, UserPlus, UserCheck, LogOut } from 'lucide-react-native';
import { fetchUserProfile } from '../api/users';
import { fetchUserPosts } from '../api/posts';
import { toggleFollow } from '../api/follows';
import { getOrCreateConversation } from '../api/messages';
import { useSession } from '../stores/session';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_GAP = 4;
const GRID_ITEM = (SCREEN_WIDTH - 32 - GRID_GAP * 2) / 3;

const TABS = [
  { key: 'posts', label: 'Работы' },
  { key: 'likes', label: 'Лайки' },
  { key: 'media', label: 'Медиа' },
] as const;

export function ProfileContent({ username, isOwn }: { username: string; isOwn: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const logout = useSession((s) => s.logout);
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('posts');

  const profileQuery = useQuery({
    queryKey: ['profile', username],
    queryFn: () => fetchUserProfile(username),
    enabled: !!username,
  });

  const profile = profileQuery.data;

  const postsQuery = useQuery({
    queryKey: ['profile-posts', profile?.id, tab],
    queryFn: () => fetchUserPosts(profile!.id, tab),
    enabled: !!profile?.id,
  });

  const followMutation = useMutation({
    mutationFn: () => toggleFollow(profile!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', username] }),
  });

  const messageMutation = useMutation({
    mutationFn: () => getOrCreateConversation(profile!.id),
    onSuccess: (conv) => router.push(`/messages/${conv.id}`),
  });

  if (!profile) return null;

  return (
    <FlatList
      data={postsQuery.data ?? []}
      keyExtractor={(p) => p.id}
      numColumns={3}
      columnWrapperStyle={{ gap: GRID_GAP }}
      contentContainerStyle={{ gap: GRID_GAP, paddingHorizontal: 16, paddingBottom: 24 }}
      renderItem={({ item }) => (
        <Pressable style={{ width: GRID_ITEM, height: GRID_ITEM }} className="overflow-hidden rounded-lg bg-brand-card">
          {item.media_urls[0] ? (
            <Image source={{ uri: item.media_urls[0] }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <View className="flex-1 items-center justify-center p-2">
              <Text numberOfLines={4} className="text-xs text-brand-muted">
                {item.content}
              </Text>
            </View>
          )}
        </Pressable>
      )}
      ListEmptyComponent={
        postsQuery.isLoading ? null : <Text className="mt-8 text-center text-brand-muted">Пока ничего нет</Text>
      }
      ListHeaderComponent={
        <View className="mb-4">
          <View className="relative mb-14">
            <LinearGradient
              colors={['#4C67CF', '#CD83F5']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ height: 140, width: '100%' }}
            >
              {profile.banner_url ? (
                <Image source={{ uri: profile.banner_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              ) : null}
            </LinearGradient>
            <View className="absolute right-4 top-10 flex-row gap-2">
              {isOwn ? (
                <Pressable onPress={() => logout()} className="h-9 w-9 items-center justify-center rounded-full bg-black/40">
                  <LogOut size={16} color="#F9FAFD" />
                </Pressable>
              ) : (
                <Pressable className="h-9 w-9 items-center justify-center rounded-full bg-black/40">
                  <Share2 size={16} color="#F9FAFD" />
                </Pressable>
              )}
              <Pressable className="h-9 w-9 items-center justify-center rounded-full bg-black/40">
                <Settings size={16} color="#F9FAFD" />
              </Pressable>
            </View>
            <View className="absolute -bottom-10 left-4" style={{ borderRadius: 48, borderWidth: 4, borderColor: '#16192F' }}>
              <Avatar uri={profile.avatar_url} name={profile.display_name ?? profile.username} size={88} />
            </View>
            {!isOwn ? (
              <View className="absolute bottom-3 right-4 flex-row gap-2">
                <Pressable
                  onPress={() => messageMutation.mutate()}
                  className="h-9 w-9 items-center justify-center rounded-full bg-brand-card"
                >
                  <Text className="text-brand-offwhite">💬</Text>
                </Pressable>
                <Pressable
                  onPress={() => followMutation.mutate()}
                  className="flex-row items-center gap-1.5 rounded-full bg-brand-accent px-4 py-2"
                >
                  {profile.is_following ? <UserCheck size={16} color="#F9FAFD" /> : <UserPlus size={16} color="#F9FAFD" />}
                  <Text className="font-bold text-brand-offwhite">
                    {profile.is_following ? 'Вы подписаны' : 'Подписаться'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View className="px-4">
            <View className="flex-row items-center gap-1.5">
              <Text className="text-xl font-extrabold text-brand-offwhite">
                {profile.display_name ?? profile.username}
              </Text>
              {profile.is_verified ? <VerifiedBadge /> : null}
            </View>
            <View className="mt-1 flex-row items-center gap-2">
              <Text className="text-brand-muted">@{profile.username}</Text>
              {profile.pronouns ? (
                <View className="rounded-full bg-brand-accent-plus-plus px-2 py-0.5">
                  <Text className="text-xs text-brand-accent-minus">{profile.pronouns}</Text>
                </View>
              ) : null}
            </View>

            {profile.fursona_name ? (
              <View className="mt-4 flex-row items-center gap-3 rounded-2xl border border-brand-border bg-brand-card p-3">
                <View
                  className="h-9 w-9 rounded-lg"
                  style={{ backgroundColor: profile.fursona_color ?? '#4C67CF' }}
                />
                <View>
                  <Text className="text-xs font-semibold text-brand-muted">ФУРСОНА</Text>
                  <Text className="font-bold text-brand-offwhite">
                    {profile.fursona_name}
                    {profile.fursona_color ? ` · ${profile.fursona_color}` : ''}
                  </Text>
                </View>
              </View>
            ) : null}

            {profile.bio ? <Text className="mt-4 leading-5 text-brand-offwhite">{profile.bio}</Text> : null}

            <View className="mt-4 flex-row gap-3">
              <StatBox value={profile._count.posts} label="постов" />
              <StatBox value={profile._count.followers} label="подписчиков" />
              <StatBox value={profile._count.following} label="подписок" />
            </View>

            {profile.interests?.length ? (
              <View className="mt-4 flex-row flex-wrap gap-2">
                {profile.interests.map((tag) => (
                  <View key={tag} className="rounded-full bg-brand-card px-3 py-1.5">
                    <Text className="text-xs text-brand-offwhite">{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View className="mt-6 flex-row border-b border-brand-border">
              {TABS.map((t) => (
                <Pressable key={t.key} onPress={() => setTab(t.key)} className="mr-6 pb-3">
                  <Text className={tab === t.key ? 'font-bold text-brand-accent' : 'text-brand-muted'}>{t.label}</Text>
                  {tab === t.key ? <View className="mt-2 h-0.5 rounded-full bg-brand-accent" /> : null}
                </Pressable>
              ))}
            </View>
          </View>
          <View className="h-3" />
        </View>
      }
    />
  );
}

function StatBox({ value, label }: { value: number; label: string }) {
  return (
    <View className="flex-1 items-center rounded-2xl border border-brand-border bg-brand-card py-3">
      <Text className="text-lg font-extrabold text-brand-offwhite">{value}</Text>
      <Text className="text-[11px] text-brand-muted">{label}</Text>
    </View>
  );
}
