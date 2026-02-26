import { onMounted, onUnmounted } from 'vue';
import api from '../api';

export function useAnalytics() {
  const trackActivity = async (postId: string, type: string, duration?: number) => {
    try {
      await api.post('/analytics/track', { postId, type, duration });
    } catch (error) {
      console.error('Failed to track activity:', error);
    }
  };

  const observePost = (element: HTMLElement, postId: string) => {
    let viewStartTime = 0;
    let timeoutId: ReturnType<typeof setTimeout>;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            viewStartTime = Date.now();
            timeoutId = setTimeout(() => {
              const duration = Date.now() - viewStartTime;
              trackActivity(postId, 'VIEW', duration);
            }, 2000);
          } else {
            clearTimeout(timeoutId);
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(element);

    return () => {
      clearTimeout(timeoutId);
      observer.unobserve(element);
    };
  };

  return {
    trackActivity,
    observePost,
  };
}
