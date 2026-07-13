import { Pressable, Text, View } from 'react-native';
import { Avatar } from './Avatar';
import type { Story } from '../types/api';

export function StoryRing({ story, onPress }: { story: Story; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} className="items-center gap-1.5" style={{ width: 68 }}>
      <Avatar uri={story.user.avatar_url} name={story.user.display_name ?? story.user.username} size={60} ring />
      <Text numberOfLines={1} className="w-full text-center text-xs text-brand-offwhite">
        {story.user.display_name ?? story.user.username}
      </Text>
    </Pressable>
  );
}

export function AddStoryButton({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} className="items-center gap-1.5" style={{ width: 68 }}>
      <View className="h-[60px] w-[60px] items-center justify-center rounded-full border-2 border-dashed border-brand-muted">
        <Text className="text-2xl text-brand-muted">+</Text>
      </View>
      <Text className="text-xs text-brand-muted">История</Text>
    </Pressable>
  );
}
