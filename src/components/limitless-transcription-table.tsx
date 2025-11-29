"use client";

import { toast } from "@/lib/toast";
import * as chrono from "chrono-node";
import { format } from "date-fns";
import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TranscriptionContent {
  type: "heading1" | "heading2" | "heading3" | "blockquote";
  content: string;
  speakerName?: string;
  startTime?: string;
  endTime?: string;
  startOffsetMs?: number;
  endOffsetMs?: number;
}

interface Transcription {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  contents: TranscriptionContent[];
  updatedAt: string;
  markdown?: string;
}

interface LimitlessTranscriptionTableProps {
  initialQuery?: string;
}

export function LimitlessTranscriptionTable({
  initialQuery = "today",
}: LimitlessTranscriptionTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [nlpQuery, setNlpQuery] = React.useState<string>(initialQuery);
  const [activeQuery, setActiveQuery] = React.useState<string>(initialQuery);
  const [transcriptions, setTranscriptions] = React.useState<Transcription[]>(
    []
  );
  const [loading, setLoading] = React.useState(false);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  // Store the original search time range for "load before" functionality
  // Use ref to avoid dependency issues in fetchTranscriptions
  const originalSearchRangeRef = React.useRef<{
    startTime: Date;
    endTime: Date;
  } | null>(null);
  // Use state to track if we have a range (for button visibility)
  const [hasOriginalSearchRange, setHasOriginalSearchRange] = React.useState(false);
  // Ref for the "Load before" button to auto-focus when no results
  const loadBeforeButtonRef = React.useRef<HTMLButtonElement>(null);
  // Track if we've scrolled for the current query
  const hasScrolledForQueryRef = React.useRef(false);

  const fetchTranscriptions = React.useCallback(
    async (showLoadingState = true, resetData = true, nextCursor?: string, fetchBeforeRange?: boolean) => {
      if (showLoadingState) setLoading(true);

      const apiKey = localStorage.getItem("limitless_api_key");
      if (!apiKey) {
        toast.error(
          "No API key found. Please reset credentials and try again."
        );
        return;
      }

      try {
        let startTime: Date | undefined, endTime: Date | undefined;

        // If fetching before range, use the original search range's start time as end
        if (fetchBeforeRange && originalSearchRangeRef.current) {
          endTime = originalSearchRangeRef.current.startTime;
          // Don't set startTime - we'll only use end parameter to fetch before
        } else {
          // Parse natural language query for time ranges
          const query = activeQuery.trim().toLowerCase();

          // Handle custom phrases that chrono might not understand
          if (
            query === "this last hour" ||
            query === "last hour" ||
            query === "past hour"
          ) {
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            startTime = oneHourAgo;
            endTime = now;
          } else {
            // Use chrono for standard parsing
            const results = chrono.parse(activeQuery.trim());

            if (results.length > 0) {
              const result = results[0];

              if (result.start && result.end) {
                // Time range found (e.g., "today from 3 to 5pm")
                startTime = result.start.date();
                endTime = result.end.date();
              } else if (result.start) {
                const parsedTime = result.start.date();

                // Check if this is a relative time phrase that should create a range
                if (
                  query.includes("ago") ||
                  query.includes("hours ago") ||
                  query.includes("minutes ago")
                ) {
                  // For relative times like "2 hours ago", create range from that time to now
                  startTime = parsedTime;
                  endTime = new Date(); // now
                } else {
                  // Single date/time found, use full day
                  startTime = new Date(parsedTime);
                  startTime.setHours(0, 0, 0, 0);
                  endTime = new Date(parsedTime);
                  endTime.setHours(23, 59, 59, 999);
                }
              } else {
                // Return empty results instead of showing error
                setTranscriptions([]);
                setCursor(null);
                setHasMore(false);
                return;
              }
            } else {
              // Return empty results instead of showing error
              setTranscriptions([]);
              setCursor(null);
              setHasMore(false);
              return;
            }
          }
        }

        // Build query params with start/end timestamps
        // Use 20 for initial load, 10 for subsequent loads or when loading before range
        const limit = resetData && !fetchBeforeRange ? "20" : "10";
        const params = new URLSearchParams({
          limit: limit,
          direction: "desc",
          includeMarkdown: "true",
          includeHeadings: "true",
        });

        // When fetching before range, only use end parameter
        if (fetchBeforeRange && endTime) {
          params.append("end", endTime.toISOString());
        } else if (startTime && endTime) {
          params.append("start", startTime.toISOString());
          params.append("end", endTime.toISOString());
        }

        if (nextCursor) {
          params.append("cursor", nextCursor);
        }

        // Make the request with date filter
        const response = await fetch(`/api/limitless?${params.toString()}`, {
          headers: {
            "x-limitless-api-key": apiKey,
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error || `HTTP ${response.status}: ${response.statusText}`
          );
        }

        const data = await response.json();

        // Extract transcriptions and pagination info
        let newTranscriptions = [];
        let responseCursor = null;

        if (data.data && data.data.lifelogs) {
          newTranscriptions = data.data.lifelogs;
        } else if (data.lifelogs) {
          newTranscriptions = data.lifelogs;
        }

        if (data.meta && data.meta.lifelogs && data.meta.lifelogs.nextCursor) {
          responseCursor = data.meta.lifelogs.nextCursor;
        }

        // Ensure transcriptions is always an array
        const transcriptionsArray = Array.isArray(newTranscriptions)
          ? newTranscriptions
          : [];

        if (resetData && !fetchBeforeRange) {
          setTranscriptions(transcriptionsArray);
          setCursor(responseCursor);
          // Store the original search range when resetting data (not when loading before)
          // Only store if we have valid startTime and endTime
          if (startTime && endTime) {
            originalSearchRangeRef.current = { startTime, endTime };
            setHasOriginalSearchRange(true);
          } else {
            setHasOriginalSearchRange(false);
          }
        } else {
          // Append to existing transcriptions for pagination or loading before range, filtering out duplicates
          setTranscriptions((prev) => {
            const existingIds = new Set(prev.map((t) => t.id));
            const newUniqueTranscriptions = transcriptionsArray.filter(
              (t) => !existingIds.has(t.id)
            );
            return [...prev, ...newUniqueTranscriptions];
          });
          setCursor(responseCursor);
        }

        setHasMore(!!responseCursor);
      } catch (error) {
        console.error("API Error:", error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to fetch transcriptions. Please check your API key.";
        toast.error(errorMessage);
        setTranscriptions([]);
        setCursor(null);
        setHasMore(false);
      } finally {
        if (showLoadingState) setLoading(false);
      }
    },
    [activeQuery] // Don't include originalSearchRange - it's only read when fetchBeforeRange is true
  );

  const loadMoreTranscriptions = React.useCallback(async () => {
    if (!hasMore || loading || !cursor) return;
    await fetchTranscriptions(false, false, cursor);
  }, [hasMore, loading, cursor, fetchTranscriptions]);

  const loadBeforeRange = React.useCallback(async () => {
    if (!originalSearchRangeRef.current || loading) return;
    // Load 10 transcriptions before the original search range
    await fetchTranscriptions(true, false, undefined, true);
  }, [loading, fetchTranscriptions]);

  const handleSearch = () => {
    // Check if user typed "y1", "y2", "y3" etc and convert to actual date
    // Supports both "y1" and "y1 2 to 5pm" formats
    const yShortcutMatch = nlpQuery.trim().toLowerCase().match(/^y(\d+)(\s+.*)?$/);
    let queryToUse = nlpQuery;

    if (yShortcutMatch) {
      const daysAgo = parseInt(yShortcutMatch[1], 10);
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - daysAgo);

      // Format as "YYYY-MM-DD"
      const formattedDate = format(targetDate, "yyyy-MM-dd");

      // If there's additional text after "y1" (like "2 to 5pm"), append it
      const additionalText = yShortcutMatch[2] || "";
      queryToUse = formattedDate + additionalText;

      // Update the input field to show the actual date
      setNlpQuery(queryToUse);
    }

    // Convert 24-hour military time formats (e.g., "1405" -> "14:05", "205" -> "02:05")
    queryToUse = queryToUse.replace(/\b(\d{3,4})\b/g, (match) => {
      // Only process 3 or 4 digit numbers that look like times
      if (match.length === 3) {
        // e.g., "205" -> "02:05"
        const hours = match.slice(0, 1).padStart(2, '0');
        const minutes = match.slice(1);
        return `${hours}:${minutes}`;
      } else if (match.length === 4) {
        // e.g., "1405" -> "14:05"
        const hours = match.slice(0, 2);
        const minutes = match.slice(2);
        // Validate it's a reasonable time (hours 0-23, minutes 0-59)
        const h = parseInt(hours, 10);
        const m = parseInt(minutes, 10);
        if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
          return `${hours}:${minutes}`;
        }
      }
      return match; // Return unchanged if not a valid time
    });

    // Update the input field to show the formatted query
    setNlpQuery(queryToUse);

    // Update URL with the query
    const params = new URLSearchParams();
    params.set("q", queryToUse);
    router.push(`${pathname}?${params.toString()}`);

    // Set the active query to trigger a new search
    setActiveQuery(queryToUse);
  };

  // Update local state when URL changes (e.g., from back/forward navigation)
  React.useEffect(() => {
    setNlpQuery(initialQuery);
    setActiveQuery(initialQuery);
  }, [initialQuery]);

  React.useEffect(() => {
    // Fetch when activeQuery changes (including initial load)
    // Reset scroll flag when query changes
    hasScrolledForQueryRef.current = false;
    fetchTranscriptions();
  }, [activeQuery, fetchTranscriptions]);

  // Auto-load transcriptions before range when no results are found
  // This will keep loading until we find results or there's an error
  React.useEffect(() => {
    if (
      !loading &&
      transcriptions.length === 0 &&
      hasOriginalSearchRange
    ) {
      // Keep loading until we get results
      loadBeforeRange();
    }
  }, [loading, transcriptions.length, hasOriginalSearchRange, loadBeforeRange]);

  // Scroll to the original query time range when results are found
  // Works for both auto-loaded results and immediate results
  React.useEffect(() => {
    if (
      !loading &&
      transcriptions.length > 0 &&
      originalSearchRangeRef.current &&
      !hasScrolledForQueryRef.current // Only scroll once per query
    ) {
      // Find the transcription that contains or is closest to the original start time
      const targetTime = originalSearchRangeRef.current.startTime;

      // Small delay to ensure DOM is rendered
      setTimeout(() => {
        // Find the LAST content segment that matches or is closest to target time
        // (chronologically first, but last in the list since they're sorted desc)
        const contentElements = document.querySelectorAll('[data-content-time]');
        let targetElement: HTMLElement | null = null;
        let closestDiff = Infinity;

        // Iterate through all content segments to find matches
        contentElements.forEach((el) => {
          const timeStr = el.getAttribute('data-content-time');
          if (timeStr) {
            const elementTime = new Date(timeStr);
            const diff = Math.abs(elementTime.getTime() - targetTime.getTime());

            // Find closest match, but prefer LATER elements (last chronologically)
            // Use <= instead of < to keep updating to later elements with same diff
            if (diff <= closestDiff) {
              closestDiff = diff;
              targetElement = el as HTMLElement;
            }
          }
        });

        if (targetElement) {
          const timeStr = targetElement.getAttribute('data-content-time');
          console.log('[Scroll] Scrolling to content segment:', {
            time: timeStr,
            targetTime: targetTime.toISOString(),
            element: targetElement,
            closestDiff: closestDiff,
            closestDiffSeconds: Math.round(closestDiff / 1000),
          });
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Mark as scrolled to prevent re-scrolling
          hasScrolledForQueryRef.current = true;
        } else {
          console.log('[Scroll] No target content segment found. Target time:', targetTime.toISOString());
        }
      }, 300);
    }
  }, [loading, transcriptions.length]);

  const formatTranscriptionTime = (timestamp: string) => {
    try {
      return format(new Date(timestamp), "h:mm a");
    } catch {
      return timestamp;
    }
  };

  const formatActualTime = (
    transcriptionStartTime: string,
    offsetMs: number
  ) => {
    try {
      const startTime = new Date(transcriptionStartTime);
      const actualTime = new Date(startTime.getTime() + offsetMs);
      return format(actualTime, "h:mm:ss a");
    } catch {
      // Fallback to offset time if date parsing fails
      const totalSeconds = Math.floor(offsetMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }
  };

  const renderTranscriptionContent = (transcription: Transcription) => {
    const textContents = transcription.contents.filter(
      (content) => content.type === "blockquote" && content.content?.trim()
    );

    if (textContents.length === 0) {
      return (
        <p className="text-sm text-muted-foreground italic">
          No transcription content available
        </p>
      );
    }

    // Reverse the content order so newest timestamps appear first
    const reversedContents = [...textContents].reverse();

    // Remove debug logging - feature is working now

    const SILENCE_THRESHOLD_MS = 3000; // 3 seconds - lower threshold to see more gaps

    return (
      <div className="space-y-1">
        {reversedContents.map((content, index) => {
          // Calculate time gap from previous segment (remember: array is in reverse chronological order!)
          let silenceGap = 0;
          if (index > 0) {
            const prevSegmentInArray = reversedContents[index - 1]; // This happened LATER in time
            const currentSegment = content; // This happened EARLIER in time

            // Since we're displaying in reverse chronological order (newest first):
            // We want to show gaps between segments as they actually occurred
            // The gap is: laterSegment.startOffset - earlierSegment.endOffset
            if (
              currentSegment.endOffsetMs !== undefined &&
              prevSegmentInArray.startOffsetMs !== undefined
            ) {
              // Gap between when current (earlier) ended and prev (later) started
              silenceGap =
                prevSegmentInArray.startOffsetMs - currentSegment.endOffsetMs;

              // Only show positive gaps
              silenceGap = Math.max(0, silenceGap);
            }
          }

          const showSilenceIndicator = silenceGap > SILENCE_THRESHOLD_MS;
          const silenceDurationSeconds = Math.floor(silenceGap / 1000);
          const silenceMinutes = Math.floor(silenceDurationSeconds / 60);
          const silenceSeconds = silenceDurationSeconds % 60;

          return (
            <React.Fragment key={index}>
              {/* Show silence indicator if there's a significant gap */}
              {showSilenceIndicator && (
                <div className="my-3 -mx-1">
                  <div className="h-8 rounded-md border border-dashed border-border/40 bg-muted/10 relative overflow-hidden">
                    {/* Hatched pattern using CSS */}
                    <div
                      className="absolute inset-0 opacity-20"
                      style={{
                        backgroundImage: `repeating-linear-gradient(
                          45deg,
                          transparent,
                          transparent 5px,
                          currentColor 5px,
                          currentColor 6px
                        )`,
                      }}
                    />
                    <div className="absolute inset-0 flex items-center pl-16">
                      <span className="text-xs text-muted-foreground italic bg-background/80 backdrop-blur-sm px-2 py-0.5 rounded">
                        {silenceMinutes > 0
                          ? `${silenceMinutes}m ${silenceSeconds}s silence`
                          : `${silenceSeconds}s silence`}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Original transcript segment */}
              <div
                className="flex items-start gap-2"
                data-content-time={content.startOffsetMs !== undefined
                  ? new Date(new Date(transcription.startTime).getTime() + content.startOffsetMs).toISOString()
                  : undefined}
              >
                {content.startOffsetMs !== undefined && (
                  <span className="text-xs text-muted-foreground font-mono min-w-[60px] mt-0.5">
                    {formatActualTime(
                      transcription.startTime,
                      content.startOffsetMs
                    )}
                  </span>
                )}
                <p className="text-xs leading-relaxed text-foreground flex-1">
                  {content.content}
                </p>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-8rem)] space-y-6 border rounded-xl p-6 overflow-auto overscroll-none">
      {/* Simple NLP Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder="today from 3 to 5pm"
          value={nlpQuery}
          onChange={(e) => setNlpQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSearch();
            }
          }}
          className="pl-10 border-border/60 hover:border-border focus:border-border"
        />
        <Button
          onClick={handleSearch}
          size="sm"
          disabled={loading}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 h-7 px-3"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            "Search"
          )}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-muted-foreground animate-pulse">
              Loading transcriptions...
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {!Array.isArray(transcriptions) || transcriptions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <p className="text-muted-foreground">
                No transcriptions found for the selected date range.
              </p>
              {hasOriginalSearchRange && (
                <Button
                  ref={loadBeforeButtonRef}
                  onClick={loadBeforeRange}
                  variant="outline"
                  disabled={loading}
                  className="hover:bg-accent/60 border-border/60 hover:border-border transition-all duration-200"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span>Loading...</span>
                    </div>
                  ) : (
                    "Load 10 transcriptions before this range"
                  )}
                </Button>
              )}
            </div>
          ) : (
            transcriptions.map((transcription) => (
              <div
                key={transcription.id}
                data-transcription-time={transcription.startTime}
                className="rounded-lg border border-border/60 overflow-hidden shadow-sm bg-card hover:shadow-md transition-all duration-200"
              >
                <div className="px-6 py-4 border-b border-border/40 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-foreground text-sm">
                      {transcription.title || "Untitled Transcription"}
                    </h3>
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <span>
                        {formatTranscriptionTime(transcription.startTime)} -{" "}
                        {formatTranscriptionTime(transcription.endTime)}
                      </span>
                      <span>
                        {format(
                          new Date(transcription.updatedAt),
                          "MMM dd, yyyy"
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="px-6 py-4">
                  {renderTranscriptionContent(transcription)}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div className="flex flex-col items-center space-y-4">
        {hasMore && transcriptions.length > 0 && (
          <Button
            onClick={loadMoreTranscriptions}
            variant="outline"
            disabled={loading}
            className="hover:bg-accent/60 border-border/60 hover:border-border transition-all duration-200"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Loading more...</span>
              </div>
            ) : (
              "Load More Transcriptions"
            )}
          </Button>
        )}

        <p className="text-sm text-muted-foreground">
          Showing {Array.isArray(transcriptions) ? transcriptions.length : 0}{" "}
          transcription
          {Array.isArray(transcriptions) && transcriptions.length !== 1
            ? "s"
            : ""}{" "}
          for &ldquo;{activeQuery}&rdquo;
        </p>
      </div>
    </div>
  );
}
