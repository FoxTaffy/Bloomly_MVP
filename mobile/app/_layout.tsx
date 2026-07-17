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
import { wsClient } from '../src/lib/wsClient';
import type { Conversation, Message } from '../src/types/api';

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

  // App-wide realtime chat sync — one shared connection, alive regardless of which
  // screen is open, so other logged-in devices (web, another phone) stay in sync.
  useEffect(() => {
    if (!isAuthenticated) {
      wsClient.disconnect();
      return;
    }
    wsClient.connect();

    const offNewMessage = wsClient.on('new_message', (raw) => {
      const data = raw.data as Message | undefined;
      if (!data) return;
      const myId = useSession.getState().user?.id;

      queryClient.setQueryData<Message[]>(['messages', data.conversation_id], (old) =>
        old && !old.some((m) => m.id === data.id) ? [...old, data] : old,
      );

      queryClient.setQueryData<Conversation[]>(['conversations'], (old) => {
        if (!old) return old;
        const idx = old.findIndex((c) => c.id === data.conversation_id);
        if (idx === -1) {
          // Unknown conversation (e.g. first message from someone new) — refetch to pick it up
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          return old;
        }
        const updated = {
          ...old[idx],
          last_message: data,
          unread_count: data.sender_id === myId ? old[idx].unread_count : old[idx].unread_count + 1,
        };
        const rest = old.filter((_, i) => i !== idx);
        return [updated, ...rest];
      });
    });

    const offMessageUpdated = wsClient.on('message_updated', (raw) => {
      const data = raw.data as Message | undefined;
      if (!data) return;
      queryClient.setQueryData<Message[]>(['messages', data.conversation_id], (old) =>
        old?.map((m) => (m.id === data.id ? data : m)),
      );
    });

    const offMessageDeleted = wsClient.on('message_deleted', (raw) => {
      const data = raw.data as { id: string; conversation_id: string } | undefined;
      if (!data) return;
      queryClient.setQueryData<Message[]>(['messages', data.conversation_id], (old) =>
        old?.filter((m) => m.id !== data.id),
      );
    });

    const offReadReceipt = wsClient.on('read_receipt', (raw) => {
      const data = raw as unknown as { conversationId: string; userId: string };
      const myId = useSession.getState().user?.id;
      // Only our own read state (from another device) should clear our unread badge
      if (data.userId !== myId) return;
      queryClient.setQueryData<Conversation[]>(['conversations'], (old) =>
        old?.map((c) => (c.id === data.conversationId ? { ...c, unread_count: 0 } : c)),
      );
    });

    return () => {
      offNewMessage();
      offMessageUpdated();
      offMessageDeleted();
      offReadReceipt();
    };
  }, [isAuthenticated]);

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
