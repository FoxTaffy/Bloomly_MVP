import { View, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useSession } from '../../src/stores/session';
import { ProfileContent } from '../../src/components/ProfileContent';

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const currentUser = useSession((s) => s.user);
  const isOwn = currentUser?.username === username;

  return (
    <SafeAreaView className="flex-1 bg-brand-bg" edges={['top']}>
      <View className="flex-row items-center px-4 py-2">
        <Pressable onPress={() => router.back()} className="h-9 w-9 items-center justify-center rounded-full bg-brand-card">
          <ChevronLeft size={18} color="#F9FAFD" />
        </Pressable>
        <Text className="ml-3 text-base font-bold text-brand-offwhite">@{username}</Text>
      </View>
      <ProfileContent username={username} isOwn={isOwn} />
    </SafeAreaView>
  );
}
