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

  // Below this, a card that merely scrolled through the viewport doesn't count as a "read".
  const MIN_VIEW_MS = 2000;

  const observePost = (element: HTMLElement, postId: string) => {
    // Guard: element must be a real DOM Element
    if (!(element instanceof Element)) return () => {};

    // Real accumulated dwell time (not a fixed threshold) — someone who lingers 20s on a post
    // is a much stronger signal than someone who barely crosses MIN_VIEW_MS, and the backend
    // weighs the resulting affinity nudge by this duration (see applyViewAffinity).
    let visibleSince: number | null = null;
    let accumulated = 0;

    const flush = () => {
      if (visibleSince !== null) {
        accumulated += Date.now() - visibleSince;
        visibleSince = null;
      }
      if (!viewedPostIds.has(postId) && accumulated >= MIN_VIEW_MS) {
        viewedPostIds.add(postId);
        trackActivity(postId, 'VIEW', accumulated);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (viewedPostIds.has(postId)) return;
          if (entry.isIntersecting) {
            visibleSince = Date.now();
          } else {
            flush();
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(element);

    return () => {
      flush();
      observer.unobserve(element);
    };
  };

  return {
    trackActivity,
    observePost,
  };
}
