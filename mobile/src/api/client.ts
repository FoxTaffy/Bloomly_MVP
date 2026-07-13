import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_URL } from '../lib/config';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'x-client': 'mobile' },
});

let getToken: () => string | null = () => null;
let doRefresh: () => Promise<string | null> = async () => null;
let onUnauthorized: () => void = () => {};

export function configureApiClient(handlers: {
  getToken: () => string | null;
  onRefresh: () => Promise<string | null>;
  onUnauthorized: () => void;
}) {
  getToken = handlers.getToken;
  doRefresh = handlers.onRefresh;
  onUnauthorized = handlers.onUnauthorized;
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (error.response?.status === 401 && original && !original._retry && !original.url?.includes('/auth/refresh')) {
      original._retry = true;
      if (!refreshPromise) {
        refreshPromise = doRefresh().finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;
      if (newToken) {
        original.headers.set('Authorization', `Bearer ${newToken}`);
        return api(original);
      }
      onUnauthorized();
    }
    return Promise.reject(error);
  },
);
