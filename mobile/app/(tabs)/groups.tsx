import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react-native';
import { fetchMyGroups, fetchRecommendedGroups, fetchUpcomingEvents, fetchEventAttendees, rsvpEvent, joinGroup } from '../../src/api/groups';
import { EventCard } from '../../src/components/EventCard';
import { GroupRow } from '../../src/components/GroupRow';

export default function GroupsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const eventsQuery = useQuery({ queryKey: ['events', 'upcoming'], queryFn: fetchUpcomingEvents });
  const myGroupsQuery = useQuery({ queryKey: ['groups', 'me'], queryFn: fetchMyGroups });
  const recommendedQuery = useQuery({ queryKey: ['groups', 'discover'], queryFn: fetchRecommendedGroups });

  const featured = eventsQuery.data?.[0];

  const attendeesQuery = useQuery({
    queryKey: ['event-attendees', featured?.id],
    queryFn: () => fetchEventAttendees(featured!.id),
    enabled: !!featured?.id,
  });

  const rsvpMutation = useMutation({
    mutationFn: () => rsvpEvent(featured!.id, 'going'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events', 'upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['event-attendees', featured?.id] });
    },
  });

  const joinMutation = useMutation({
    mutationFn: (id: string) => joinGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['groups', 'discover'] });
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-brand-bg" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 py-2">
        <Text className="text-2xl font-extrabold text-brand-offwhite">Сообщества</Text>
        <Pressable className="h-10 w-10 items-center justify-center rounded-full bg-brand-card">
          <Plus size={18} color="#F9FAFD" />
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="px-4 pb-8">
        {featured ? (
          <EventCard
            event={featured}
            attendees={attendeesQuery.data ?? []}
            going={false}
            onRsvp={() => rsvpMutation.mutate()}
            onPress={() => router.push(`/events/${featured.id}`)}
          />
        ) : null}

        <Text className="mb-3 text-sm font-semibold text-brand-muted">МОИ ГРУППЫ</Text>
        {(myGroupsQuery.data ?? []).map((group) => (
          <GroupRow
            key={group.id}
            group={group}
            actionLabel="Открыть"
            onAction={() => router.push(`/groups/${group.id}`)}
            onPress={() => router.push(`/groups/${group.id}`)}
          />
        ))}

        <Text className="mb-3 mt-4 text-sm font-semibold text-brand-muted">РЕКОМЕНДУЕМ</Text>
        {(recommendedQuery.data ?? []).map((group) => (
          <GroupRow
            key={group.id}
            group={group}
            actionLabel="Вступить"
            onAction={() => joinMutation.mutate(group.id)}
            onPress={() => router.push(`/groups/${group.id}`)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
