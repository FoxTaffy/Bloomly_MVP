import { useState } from 'react';
import { View, Text, Pressable, ScrollView, NativeSyntheticEvent, NativeScrollEvent, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { mediaSource } from '../api/client';
import { Link, useRouter } from 'expo-router';
import { Heart, MessageCircle, Repeat2, Pin } from 'lucide-react-native';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';
import { timeAgo } from '../lib/time';
import type { Post, PostAuthor } from '../types/api';

// Feed list has px-4 (16+16) and the card has p-4 (16+16): media must fit inside both.
const HORIZONTAL_SPACE = 64;

interface PostCardProps {
  post: Post;
  onVote?: (value: 1 | -1 | 0) => void;
  onRepaw?: () => void;
  /** On the post screen the card is already open, so tapping it should not navigate again. */
  interactive?: boolean;
}

export function PostCard({ post, onVote, onRepaw, interactive = true }: PostCardProps) {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const mediaWidth = screenWidth - HORIZONTAL_SPACE;
  const [page, setPage] = useState(0);
  const author = post.author;
  const groupContext = post.groupPosts?.[0]?.group;
  const liked = post.my_vote === 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / mediaWidth));
  };

  const openPost = () => router.push(`/post/${post.id}`);

  const Container = interactive ? Pressable : View;

  return (
    <Container
      {...(interactive
        ? {
            onPress: openPost,
            accessibilityRole: 'button' as const,
            accessibilityLabel: 'Открыть пост',
            className: 'mb-3 rounded-2xl border border-brand-border bg-brand-card p-4 active:opacity-90',
          }
        : { className: 'mb-3 rounded-2xl border border-brand-border bg-brand-card p-4' })}
    >
      <View className="mb-3 flex-row items-center justify-between">
        {author ? (
          <Link href={`/profile/${author.username}`} asChild>
            <Pressable className="flex-1 flex-row items-center gap-3 active:opacity-60">
              <PostAuthorHeader post={post} author={author} groupContext={groupContext} />
            </Pressable>
          </Link>
        ) : (
          <View className="flex-1 flex-row items-center gap-3">
            <PostAuthorHeader post={post} author={author} groupContext={groupContext} />
          </View>
        )}
        {post.is_announcement ? (
          <View className="ml-2 flex-row items-center gap-1 rounded-full bg-brand-accent-plus-plus px-2 py-1">
            <Pin size={12} color="#A1B4FF" />
            <Text className="text-xs font-semibold text-brand-accent-minus">Закреплён</Text>
          </View>
        ) : null}
      </View>

      {post.title ? <Text className="mb-1 text-base font-bold text-brand-offwhite">{post.title}</Text> : null}
      {post.content ? (
        <Text numberOfLines={6} className="mb-3 leading-5 text-brand-offwhite">
          {post.content}
        </Text>
      ) : null}

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
                source={mediaSource(url)}
                style={{ width: mediaWidth, height: mediaWidth * 0.75 }}
                contentFit="cover"
              />
            ))}
          </ScrollView>
          {post.media_urls.length > 1 ? (
            <View className="absolute bottom-2.5 left-0 right-0 flex-row justify-center gap-1.5">
              {post.media_urls.map((url, i) => (
                <View key={url} className={`h-1.5 rounded-full ${i === page ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View className="flex-row items-center gap-7">
        <Pressable
          onPress={() => onVote?.(liked ? 0 : 1)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Убрать лайк' : 'Лайк'}
          className="flex-row items-center gap-1.5 active:opacity-60"
        >
          <Heart size={20} color={liked ? '#E14664' : '#7C86AE'} fill={liked ? '#E14664' : 'transparent'} />
          <Text className={`text-sm ${liked ? 'font-bold text-brand-error' : 'text-brand-muted'}`}>{post._count.votes}</Text>
        </Pressable>
        <Pressable
          onPress={interactive ? openPost : undefined}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Комментарии"
          className="flex-row items-center gap-1.5 active:opacity-60"
        >
          <MessageCircle size={20} color="#7C86AE" />
          <Text className="text-sm text-brand-muted">{post._count.comments}</Text>
        </Pressable>
        <Pressable
          onPress={onRepaw}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Репост"
          className="flex-row items-center gap-1.5 active:opacity-60"
        >
          <Repeat2 size={20} color="#7C86AE" />
          <Text className="text-sm text-brand-muted">{post._count.repaws}</Text>
        </Pressable>
      </View>
    </Container>
  );
}

function PostAuthorHeader({
  post,
  author,
  groupContext,
}: {
  post: Post;
  author: PostAuthor | null;
  groupContext?: { name: string };
}) {
  return (
    <>
      <Avatar uri={author?.avatar_url} name={author?.display_name ?? author?.username} size={40} />
      <View className="flex-1">
        <View className="flex-row items-center gap-1">
          <Text className="flex-shrink font-bold text-brand-offwhite" numberOfLines={1}>
            {groupContext ? groupContext.name : (author?.display_name ?? author?.username ?? 'Bloomly')}
          </Text>
          {author?.is_verified ? <VerifiedBadge size={14} /> : null}
        </View>
        <Text className="text-xs text-brand-muted">
          @{author?.username ?? 'group'} · {timeAgo(post.created_at)}
        </Text>
      </View>
    </>
  );
}
