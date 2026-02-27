import api from '../api';

// Session-level deduplication: don't re-track a post that was already viewed this session.
const viewedPostIds = new Set<string>();

export function useAnalytics() {
  const trackActivity = async (postId: string, type: string, duration?: number) => {
    try {
      await api.post('/analytics/track', { postId, type, duration });
    } catch {
      // Analytics are best-effort; silently ignore failures
    }
  };

  const observePost = (element: HTMLElement, postId: string) => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Schedule VIEW tracking only for posts not yet tracked this session
            if (!viewedPostIds.has(postId)) {
              const viewStartTime = Date.now();
              timeoutId = setTimeout(() => {
                const duration = Date.now() - viewStartTime;
                viewedPostIds.add(postId);
                trackActivity(postId, 'VIEW', duration);
              }, 2000);
            }
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
