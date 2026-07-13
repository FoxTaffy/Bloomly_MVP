import { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSession } from '../../src/stores/session';

export default function OAuthCallbackScreen() {
  const { token, refreshToken } = useLocalSearchParams<{ token?: string; refreshToken?: string }>();
  const router = useRouter();
  const loginWithToken = useSession((s) => s.loginWithToken);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    if (!token) {
      router.replace('/(auth)/login');
      return;
    }
    loginWithToken(token, refreshToken)
      .then(() => router.replace('/(tabs)/feed'))
      .catch(() => router.replace('/(auth)/login'));
  }, [token, refreshToken, loginWithToken, router]);

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-brand-bg">
      <Image source={require('../../assets/icon.png')} style={{ width: 48, height: 48, opacity: 0.7 }} />
      <ActivityIndicator color="#4C67CF" />
      <Text className="text-sm font-medium text-brand-muted">Входим через OAuth…</Text>
    </View>
  );
}
