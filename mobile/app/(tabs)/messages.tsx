import { View, Text, TextInput, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react-native';
import { fetchConversations } from '../../src/api/messages';
import { ConversationRow } from '../../src/components/ConversationRow';

export default function MessagesScreen() {
  const router = useRouter();
  const conversationsQuery = useQuery({ queryKey: ['conversations'], queryFn: fetchConversations });

  return (
    <SafeAreaView className="flex-1 bg-brand-bg" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 py-2">
        <Text className="text-2xl font-extrabold text-brand-offwhite">Сообщения</Text>
      </View>

      <View className="mx-4 mb-2 mt-2 flex-row items-center gap-2 rounded-2xl border border-brand-border bg-brand-card px-4 py-3">
        <Search size={16} color="#7C86AE" />
        <TextInput placeholder="Поиск диалогов..." placeholderTextColor="#7C86AE" className="flex-1 text-brand-offwhite" />
      </View>

      <FlatList
        data={conversationsQuery.data ?? []}
        keyExtractor={(c) => c.id}
        refreshing={conversationsQuery.isRefetching}
        onRefresh={() => conversationsQuery.refetch()}
        renderItem={({ item }) => (
          <ConversationRow conversation={item} onPress={() => router.push(`/messages/${item.id}`)} />
        )}
        ListEmptyComponent={
          conversationsQuery.isLoading ? null : (
            <Text className="mt-10 text-center text-brand-muted">Пока нет диалогов</Text>
          )
        }
      />
    </SafeAreaView>
  );
}
