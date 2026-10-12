import { api } from './client';
import type { Group, GroupEvent, EventAttendee, Post } from '../types/api';

export async function fetchMyGroups(): Promise<Group[]> {
  const res = await api.get('/groups/me');
  return res.data.data.groups as Group[];
}

export async function fetchRecommendedGroups(): Promise<Group[]> {
  const res = await api.get('/groups/discover');
  return res.data.data.groups as Group[];
}

export async function searchGroups(q: string): Promise<Group[]> {
  const res = await api.get('/groups/search', { params: { q, limit: 10 } });
  return res.data.data.groups as Group[];
}

export async function fetchGroup(slugOrId: string): Promise<Group> {
  const res = await api.get(`/groups/${slugOrId}`);
  return res.data.data.group as Group;
}

export async function fetchGroupPosts(groupId: string): Promise<Post[]> {
  const res = await api.get(`/groups/${groupId}/posts`);
  // Server returns GroupPost join rows; the post itself is nested under `post`.
  return (res.data.data.posts as { post: Post }[]).map((row) => row.post);
}

export async function joinGroup(id: string) {
  await api.post(`/groups/${id}/join`);
}

export async function leaveGroup(id: string) {
  await api.post(`/groups/${id}/leave`);
}

export async function fetchUpcomingEvents(): Promise<GroupEvent[]> {
  const res = await api.get('/groups/events', { params: { upcoming: true } });
  return res.data.data.events as GroupEvent[];
}

export async function fetchEvent(eventId: string): Promise<GroupEvent> {
  const res = await api.get(`/groups/events/${eventId}`);
  return res.data.data.event as GroupEvent;
}

export async function fetchMyRsvp(eventId: string): Promise<EventAttendee | null> {
  const res = await api.get(`/groups/events/${eventId}/my-rsvp`);
  return (res.data.data.rsvp as EventAttendee | null) ?? null;
}

export async function rsvpEvent(eventId: string, status: 'going' | 'maybe' | 'not_going') {
  await api.post(`/groups/events/${eventId}/rsvp`, { status });
}

export async function cancelRsvp(eventId: string) {
  await api.delete(`/groups/events/${eventId}/rsvp`);
}

export async function fetchEventAttendees(eventId: string): Promise<EventAttendee[]> {
  const res = await api.get(`/groups/events/${eventId}/attendees`);
  return res.data.data.attendees as EventAttendee[];
}
