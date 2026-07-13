import 'react-native-gesture-handler';
import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
} from '@expo-google-fonts/nunito';
import { useSession } from '../src/stores/session';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function RootLayout() {
  const hydrate = useSession((s) => s.hydrate);
  const isHydrated = useSession((s) => s.isHydrated);
  const isAuthenticated = useSession((s) => s.isAuthenticated);
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
  });

  useEffect(() => {
    hydrate().finally(() => {
      if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
    });
  }, [hydrate, fontsLoaded]);

  if (!isHydrated || !fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#16192F' } }}>
            <Stack.Screen name="auth/callback" />
            <Stack.Protected guard={isAuthenticated}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="messages/[id]" />
              <Stack.Screen name="profile/[username]" />
              <Stack.Screen name="groups/[id]" />
              <Stack.Screen name="events/[id]" />
              <Stack.Screen name="notifications" />
            </Stack.Protected>
            <Stack.Protected guard={!isAuthenticated}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
