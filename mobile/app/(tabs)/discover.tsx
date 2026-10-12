import { View, Text, TextInput, FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Search, Hash } from 'lucide-react-native';
import { fetchTrendingTags } from '../../src/api/posts';

export default function DiscoverScreen() {
  const tagsQuery = useQuery({ queryKey: ['trending-tags'], queryFn: fetchTrendingTags });

  return (
    <SafeAreaView className="flex-1 bg-brand-bg" edges={['top']}>
      <View className="px-4 py-2">
        <Text className="mb-4 text-2xl font-extrabold text-brand-offwhite">Поиск</Text>
        <View className="mb-6 flex-row items-center gap-2 rounded-2xl border border-brand-border bg-brand-card px-4 py-3">
          <Search size={18} color="#7C86AE" />
          <TextInput placeholder="Найти людей, теги, посты" placeholderTextColor="#7C86AE" className="flex-1 text-brand-offwhite" />
        </View>
        <Text className="mb-3 text-sm font-semibold text-brand-muted">В ТРЕНДЕ</Text>
      </View>
      <FlatList
        data={tagsQuery.data ?? []}
        keyExtractor={(t) => t.id}
        contentContainerClassName="px-4 gap-2 pb-6"
        renderItem={({ item }) => (
          <Pressable className="flex-row items-center justify-between rounded-2xl border border-brand-border bg-brand-card px-4 py-3">
            <View className="flex-row items-center gap-2">
              <Hash size={16} color="#4C67CF" />
              <Text className="font-semibold text-brand-offwhite">{item.name}</Text>
            </View>
            <Text className="text-xs text-brand-muted">{item.count} постов</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
