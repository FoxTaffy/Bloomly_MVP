import { View, Text, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react-native';
import { fetchGroup, joinGroup, leaveGroup } from '../../src/api/groups';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const groupQuery = useQuery({ queryKey: ['group', id], queryFn: () => fetchGroup(id), enabled: !!id });
  const group = groupQuery.data;

  const joinMutation = useMutation({
    mutationFn: () => joinGroup(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group', id] }),
  });

  if (!group) return null;

  return (
    <SafeAreaView className="flex-1 bg-brand-bg" edges={['top']}>
      <ScrollView>
        <View className="relative">
          <LinearGradient colors={[group.accent_color ?? '#4C67CF', '#CD83F5']} style={{ height: 160, width: '100%' }}>
            {group.banner_url ? (
              <Image source={{ uri: group.banner_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : null}
          </LinearGradient>
          <Pressable
            onPress={() => router.back()}
            className="absolute left-4 top-4 h-9 w-9 items-center justify-center rounded-full bg-black/40"
          >
            <ChevronLeft size={18} color="#F9FAFD" />
          </Pressable>
        </View>
        <View className="p-4">
          <Text className="mb-1 text-2xl font-extrabold text-brand-offwhite">{group.name}</Text>
          <Text className="mb-4 text-brand-muted">{group.member_count.toLocaleString('ru-RU')} участников</Text>
          {group.description ? <Text className="mb-4 leading-5 text-brand-offwhite">{group.description}</Text> : null}
          <Pressable onPress={() => joinMutation.mutate()} className="rounded-2xl bg-brand-accent py-3.5">
            <Text className="text-center font-bold text-brand-offwhite">Вступить</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
