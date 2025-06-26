"use client";

import { toast } from "@/lib/toast";
import * as chrono from "chrono-node";
import { format } from "date-fns";
import { Search } from "lucide-react";
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

export function LimitlessTranscriptionTable() {
  const [nlpQuery, setNlpQuery] = React.useState<string>("today");
  const [activeQuery, setActiveQuery] = React.useState<string>("today");
  const [transcriptions, setTranscriptions] = React.useState<Transcription[]>(
    []
  );
  const [loading, setLoading] = React.useState(false);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(true);

  const fetchTranscriptions = React.useCallback(
    async (showLoadingState = true, resetData = true, nextCursor?: string) => {
      if (showLoadingState) setLoading(true);

      const apiKey = localStorage.getItem("limitless_api_key");
      if (!apiKey) {
        toast.error(
          "No API key found. Please reset credentials and try again."
        );
        return;
      }

      try {
        let startTime: Date, endTime: Date;

        // Parse natural language query for time ranges
        console.log('🔍 Parsing query:', activeQuery.trim());
        const results = chrono.parse(activeQuery.trim());
        console.log('📊 Chrono results:', results);
        
        if (results.length > 0) {
          const result = results[0];
          console.log('📅 First result:', result);
          
          if (result.start && result.end) {
            // Time range found (e.g., "today from 3 to 5pm")
            startTime = result.start.date();
            endTime = result.end.date();
            console.log('⏰ Time range found:', {
              start: startTime.toISOString(),
              end: endTime.toISOString()
            });
          } else if (result.start) {
            // Single date/time found, use full day
            startTime = new Date(result.start.date());
            startTime.setHours(0, 0, 0, 0);
            endTime = new Date(result.start.date());
            endTime.setHours(23, 59, 59, 999);
            console.log('📆 Single date found, using full day:', {
              start: startTime.toISOString(),
              end: endTime.toISOString()
            });
          } else {
            console.log('❌ No start date found in result');
            toast.error(
              "Could not understand the date/time. Try something like 'today from 3 to 5pm' or 'yesterday'"
            );
            return;
          }
        } else {
          console.log('❌ No results from chrono parsing');
          toast.error(
            "Could not understand the date/time. Try something like 'today from 3 to 5pm' or 'yesterday'"
          );
          return;
        }

        // Build query params with start/end timestamps
        // Use 20 for initial load, 10 for subsequent loads
        const limit = resetData ? "20" : "10";
        const params = new URLSearchParams({
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          limit: limit,
          direction: "desc",
          includeMarkdown: "true",
          includeHeadings: "true",
        });

        if (nextCursor) {
          params.append("cursor", nextCursor);
        }

        // Make the request with date filter
        console.log('🌐 API request URL:', `/api/limitless?${params.toString()}`);
        console.log('📋 Query params:', Object.fromEntries(params));
        
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

        if (resetData) {
          setTranscriptions(transcriptionsArray);
          setCursor(responseCursor);
        } else {
          // Append to existing transcriptions for pagination, filtering out duplicates
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
      } finally {
        if (showLoadingState) setLoading(false);
      }
    },
    [activeQuery] // Include activeQuery since we use it inside the function
  );

  const loadMoreTranscriptions = React.useCallback(async () => {
    if (!hasMore || loading || !cursor) return;
    await fetchTranscriptions(false, false, cursor);
  }, [hasMore, loading, cursor, fetchTranscriptions]);

  const handleSearch = () => {
    // Set the active query to trigger a new search
    setActiveQuery(nlpQuery);
  };

  React.useEffect(() => {
    // Fetch when activeQuery changes (including initial load)
    fetchTranscriptions();
  }, [activeQuery, fetchTranscriptions]);

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

    return (
      <div className="space-y-1">
        {reversedContents.map((content, index) => (
          <div key={index} className="flex items-start gap-2">
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
        ))}
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
            <div className="flex items-center justify-center py-20">
              <p className="text-muted-foreground">
                No transcriptions found for the selected date range.
              </p>
            </div>
          ) : (
            transcriptions.map((transcription) => (
              <div
                key={transcription.id}
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
