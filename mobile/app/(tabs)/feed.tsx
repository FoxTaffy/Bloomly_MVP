import { useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Flower2, Search, Bell, Hash } from 'lucide-react-native';
import { fetchStories } from '../../src/api/stories';
import { fetchFeed, votePost, repawPost, createPost } from '../../src/api/posts';
import { PostCard } from '../../src/components/PostCard';
import { StoryRing, AddStoryButton } from '../../src/components/StoryRing';
import { Avatar } from '../../src/components/Avatar';
import { useSession } from '../../src/stores/session';
import type { Post } from '../../src/types/api';

export default function FeedScreen() {
  const user = useSession((s) => s.user);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const storiesQuery = useQuery({ queryKey: ['stories'], queryFn: fetchStories });
  const feedQuery = useQuery({ queryKey: ['feed'], queryFn: () => fetchFeed({ personalized: true }) });

  const voteMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: 1 | -1 | 0 }) => votePost(id, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed'] }),
  });

  const repawMutation = useMutation({
    mutationFn: (id: string) => repawPost(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed'] }),
  });

  const postMutation = useMutation({
    mutationFn: () => createPost({ content: draft.trim() }),
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  const posts = feedQuery.data ?? [];

  return (
    <SafeAreaView className="flex-1 bg-brand-bg" edges={['top']}>
      <View className="mb-2 flex-row items-center justify-between px-4 py-2">
        <View className="flex-row items-center gap-2">
          <Flower2 size={22} color="#4C67CF" />
          <Text className="text-lg font-extrabold text-brand-offwhite">Bloomly</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <Pressable className="h-10 w-10 items-center justify-center rounded-full bg-brand-card">
            <Search size={18} color="#F9FAFD" />
          </Pressable>
          <Link href="/notifications" asChild>
            <Pressable className="h-10 w-10 items-center justify-center rounded-full bg-brand-card">
              <Bell size={18} color="#F9FAFD" />
            </Pressable>
          </Link>
        </View>
      </View>

      <FlatList<Post>
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-4 pb-6"
        refreshControl={
          <RefreshControl
            refreshing={feedQuery.isRefetching}
            onRefresh={() => {
              feedQuery.refetch();
              storiesQuery.refetch();
            }}
            tintColor="#4C67CF"
          />
        }
        ListHeaderComponent={
          <View>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={storiesQuery.data ?? []}
              keyExtractor={(s) => s.id}
              contentContainerClassName="gap-3 pb-4"
              ListHeaderComponent={<AddStoryButton />}
              renderItem={({ item }) => <StoryRing story={item} />}
            />

            <View className="mb-4 flex-row items-center gap-3 rounded-2xl border border-brand-border bg-brand-card px-3 py-2">
              <Avatar uri={user?.avatar_url} name={user?.display_name ?? user?.username} size={32} />
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Что у вас нового?"
                placeholderTextColor="#3A4060"
                className="flex-1 text-brand-offwhite"
                multiline
              />
              {draft.trim().length > 0 ? (
                <Pressable
                  onPress={() => postMutation.mutate()}
                  disabled={postMutation.isPending}
                  className="rounded-full bg-brand-accent px-3 py-1.5"
                >
                  <Text className="text-xs font-bold text-brand-offwhite">
                    {postMutation.isPending ? '...' : 'Опубликовать'}
                  </Text>
                </Pressable>
              ) : (
                <Hash size={18} color="#3A4060" />
              )}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onVote={(value) => voteMutation.mutate({ id: item.id, value })}
            onRepaw={() => repawMutation.mutate(item.id)}
          />
        )}
        ListEmptyComponent={
          feedQuery.isLoading ? null : (
            <Text className="mt-10 text-center text-brand-muted">Пока пусто. Подпишись на кого-нибудь!</Text>
          )
        }
      />
    </SafeAreaView>
  );
}
