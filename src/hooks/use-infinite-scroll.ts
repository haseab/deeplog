import { useCallback, useEffect, useRef, useState } from "react";

interface UseInfiniteScrollOptions {
  threshold?: number;
  rootMargin?: string;
  enabled?: boolean;
}

interface UseInfiniteScrollReturn {
  ref: React.RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  hasError: boolean;
  clearError: () => void;
}

export function useInfiniteScroll(
  onLoadMore: () => void | Promise<void>,
  options: UseInfiniteScrollOptions = {}
): UseInfiniteScrollReturn {
  const { threshold = 1.0, rootMargin = "100px", enabled = true } = options;
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastAttemptRef = useRef<number>(0);

  const handleIntersection = useCallback(
    async (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      
      // Prevent rapid successive attempts - minimum 2 seconds between attempts
      const now = Date.now();
      if (now - lastAttemptRef.current < 2000) {
        return;
      }
      
      if (entry.isIntersecting && enabled && !isLoading && !hasError) {
        setIsLoading(true);
        lastAttemptRef.current = now;
        
        try {
          await onLoadMore();
          setHasError(false); // Clear error on successful load
        } catch (error) {
          console.error("Infinite scroll load more failed:", error);
          setHasError(true);
        } finally {
          setIsLoading(false);
        }
      }
    },
    [onLoadMore, enabled, isLoading, hasError]
  );

  const clearError = useCallback(() => {
    setHasError(false);
    lastAttemptRef.current = 0;
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;

    observerRef.current = new IntersectionObserver(handleIntersection, {
      threshold,
      rootMargin,
    });

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [handleIntersection, threshold, rootMargin, enabled]);

  return {
    ref,
    isLoading,
    setIsLoading,
    hasError,
    clearError,
  };
}