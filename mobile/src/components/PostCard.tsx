import { useState } from 'react';
import { View, Text, Pressable, ScrollView, NativeSyntheticEvent, NativeScrollEvent, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Heart, MessageCircle, Repeat2, Pin } from 'lucide-react-native';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';
import { timeAgo } from '../lib/time';
import type { Post } from '../types/api';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_PADDING = 32;
const MEDIA_WIDTH = SCREEN_WIDTH - CARD_PADDING;

interface PostCardProps {
  post: Post;
  onVote?: (value: 1 | -1 | 0) => void;
  onRepaw?: () => void;
}

export function PostCard({ post, onVote, onRepaw }: PostCardProps) {
  const [page, setPage] = useState(0);
  const author = post.author;
  const groupContext = post.groupPosts?.[0]?.group;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / MEDIA_WIDTH);
    setPage(idx);
  };

  return (
    <View className="mb-4 rounded-2xl border border-brand-border bg-brand-card p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <Link href={author ? `/profile/${author.username}` : '#'} asChild>
          <Pressable className="flex-row items-center gap-3">
            <Avatar uri={author?.avatar_url} name={author?.display_name ?? author?.username} size={40} />
            <View>
              <View className="flex-row items-center gap-1">
                <Text className="font-bold text-brand-offwhite">
                  {groupContext ? groupContext.name : author?.display_name ?? author?.username ?? 'Bloomly'}
                </Text>
                {author?.is_verified ? <VerifiedBadge size={14} /> : null}
              </View>
              <Text className="text-xs text-brand-muted">
                @{author?.username ?? 'group'} · {timeAgo(post.created_at)}
              </Text>
            </View>
          </Pressable>
        </Link>
        {post.is_announcement ? (
          <View className="flex-row items-center gap-1 rounded-full bg-brand-accent-plus-plus px-2 py-1">
            <Pin size={12} color="#A1B4FF" />
            <Text className="text-xs font-semibold text-brand-accent-minus">Закреплён</Text>
          </View>
        ) : null}
      </View>

      {post.title ? <Text className="mb-1 text-base font-bold text-brand-offwhite">{post.title}</Text> : null}
      {post.content ? <Text className="mb-3 leading-5 text-brand-offwhite">{post.content}</Text> : null}

      {post.media_urls.length > 0 ? (
        <View className="mb-3 overflow-hidden rounded-2xl">
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
          >
            {post.media_urls.map((url) => (
              <Image
                key={url}
                source={{ uri: url }}
                style={{ width: MEDIA_WIDTH, height: MEDIA_WIDTH * 0.75 }}
                contentFit="cover"
              />
            ))}
          </ScrollView>
          {post.media_urls.length > 1 ? (
            <View className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-1">
              <Text className="text-xs font-semibold text-white">
                {page + 1} / {post.media_urls.length}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View className="flex-row items-center gap-6">
        <Pressable onPress={() => onVote?.(post.my_vote === 1 ? 0 : 1)} className="flex-row items-center gap-1.5">
          <Heart
            size={20}
            color={post.my_vote === 1 ? '#E14664' : '#3A4060'}
            fill={post.my_vote === 1 ? '#E14664' : 'transparent'}
          />
          <Text className="text-sm text-brand-muted">{post._count.votes}</Text>
        </Pressable>
        <View className="flex-row items-center gap-1.5">
          <MessageCircle size={20} color="#3A4060" />
          <Text className="text-sm text-brand-muted">{post._count.comments}</Text>
        </View>
        <Pressable onPress={onRepaw} className="flex-row items-center gap-1.5">
          <Repeat2 size={20} color="#3A4060" />
          <Text className="text-sm text-brand-muted">{post._count.repaws}</Text>
        </Pressable>
      </View>
    </View>
  );
}
