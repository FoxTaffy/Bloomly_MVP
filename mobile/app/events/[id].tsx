import { View, Text, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Calendar, MapPin } from 'lucide-react-native';
import { fetchEvent, fetchEventAttendees, rsvpEvent } from '../../src/api/groups';
import { Avatar } from '../../src/components/Avatar';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const eventQuery = useQuery({ queryKey: ['event', id], queryFn: () => fetchEvent(id), enabled: !!id });
  const attendeesQuery = useQuery({
    queryKey: ['event-attendees', id],
    queryFn: () => fetchEventAttendees(id),
    enabled: !!id,
  });

  const rsvpMutation = useMutation({
    mutationFn: (status: 'going' | 'maybe' | 'not_going') => rsvpEvent(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', id] });
      queryClient.invalidateQueries({ queryKey: ['event-attendees', id] });
    },
  });

  const event = eventQuery.data;
  if (!event) return null;

  const starts = new Date(event.starts_at);

  return (
    <SafeAreaView className="flex-1 bg-brand-bg" edges={['top']}>
      <ScrollView>
        <View className="relative">
          <LinearGradient colors={['#4C67CF', '#CD83F5']} style={{ height: 180, width: '100%' }}>
            {event.banner_url ? (
              <Image source={{ uri: event.banner_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
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
          <Text className="mb-2 text-2xl font-extrabold text-brand-offwhite">{event.title}</Text>
          <View className="mb-1.5 flex-row items-center gap-2">
            <Calendar size={16} color="#3A4060" />
            <Text className="text-brand-muted">
              {starts.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
              {starts.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          {event.location_name ? (
            <View className="mb-4 flex-row items-center gap-2">
              <MapPin size={16} color="#3A4060" />
              <Text className="text-brand-muted">{event.location_name}</Text>
            </View>
          ) : null}

          {event.description ? <Text className="mb-6 leading-5 text-brand-offwhite">{event.description}</Text> : null}

          <View className="mb-6 flex-row gap-2">
            <Pressable
              onPress={() => rsvpMutation.mutate('going')}
              className="flex-1 rounded-2xl bg-brand-accent py-3.5"
            >
              <Text className="text-center font-bold text-brand-offwhite">Пойду</Text>
            </Pressable>
            <Pressable
              onPress={() => rsvpMutation.mutate('maybe')}
              className="flex-1 rounded-2xl border border-brand-border bg-brand-card py-3.5"
            >
              <Text className="text-center font-bold text-brand-offwhite">Может быть</Text>
            </Pressable>
          </View>

          <Text className="mb-3 text-sm font-semibold text-brand-muted">
            УЧАСТНИКИ · {event.attendee_count}
          </Text>
          <View className="flex-row flex-wrap gap-3">
            {(attendeesQuery.data ?? []).map((a) => (
              <View key={a.user_id} className="items-center" style={{ width: 56 }}>
                <Avatar uri={a.user.avatar_url} name={a.user.display_name ?? a.user.username} size={44} />
                <Text numberOfLines={1} className="mt-1 w-full text-center text-[11px] text-brand-muted">
                  {a.user.display_name ?? a.user.username}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
