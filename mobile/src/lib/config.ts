const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://bloomly.fun';

export const API_URL = `${API_BASE}/api`;
export const WS_URL = `${API_BASE.replace(/^http/, 'ws')}/api/`;
