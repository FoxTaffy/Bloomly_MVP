import { api } from './client';

export async function acceptRelationship(requestId: string) {
  await api.post(`/relationships/${requestId}/accept`);
}

export async function declineRelationship(requestId: string) {
  await api.post(`/relationships/${requestId}/decline`);
}
