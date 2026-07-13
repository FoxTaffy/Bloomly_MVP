import { api } from './client';
import type { Group, GroupEvent, EventAttendee } from '../types/api';

export async function fetchMyGroups(): Promise<Group[]> {
  const res = await api.get('/groups/me');
  return res.data.data.groups as Group[];
}

export async function fetchRecommendedGroups(): Promise<Group[]> {
  const res = await api.get('/groups/discover');
  return res.data.data.groups as Group[];
}

export async function fetchGroup(slugOrId: string): Promise<Group> {
  const res = await api.get(`/groups/${slugOrId}`);
  return res.data.data.group as Group;
}

export async function joinGroup(id: string) {
  await api.post(`/groups/${id}/join`);
}

export async function leaveGroup(id: string) {
  await api.post(`/groups/${id}/leave`);
}

export async function fetchUpcomingEvents(): Promise<GroupEvent[]> {
  const res = await api.get('/events', { params: { upcoming: true } });
  return res.data.data.events as GroupEvent[];
}

export async function fetchEvent(eventId: string): Promise<GroupEvent> {
  const res = await api.get(`/events/${eventId}`);
  return res.data.data.event as GroupEvent;
}

export async function rsvpEvent(eventId: string, status: 'going' | 'maybe' | 'not_going') {
  await api.post(`/events/${eventId}/rsvp`, { status });
}

export async function fetchEventAttendees(eventId: string): Promise<EventAttendee[]> {
  const res = await api.get(`/events/${eventId}/attendees`);
  return res.data.data.attendees as EventAttendee[];
}
