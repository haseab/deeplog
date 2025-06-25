"use client";

import { toast } from "@/lib/toast";
import { endOfDay, format, startOfDay, addDays, subDays } from "date-fns";
import { Calendar as CalendarIcon, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import React from "react";
import { DayPicker } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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
  const [selectedDate, setSelectedDate] = React.useState<Date>(new Date());
  const [transcriptions, setTranscriptions] = React.useState<Transcription[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(true);

  const fetchTranscriptions = React.useCallback(
    async (showLoadingState = true, resetData = true, nextCursor?: string) => {
      if (showLoadingState) setLoading(true);
      
      const apiKey = localStorage.getItem("limitless_api_key");
      if (!apiKey) {
        toast.error("No API key found. Please reset credentials and try again.");
        return;
      }

      try {
        const dateStr = format(selectedDate, "yyyy-MM-dd"); // YYYY-MM-DD format
        
        // Build query params
        const params = new URLSearchParams({
          date: dateStr,
          limit: "10",
          direction: "desc",
          includeMarkdown: "true",
          includeHeadings: "true"
        });
        
        if (nextCursor) {
          params.append("cursor", nextCursor);
        }
        
        // Make the request with date filter
        const response = await fetch(
          `/api/limitless?${params.toString()}`,
          {
            headers: {
              "x-limitless-api-key": apiKey,
            },
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
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
        const transcriptionsArray = Array.isArray(newTranscriptions) ? newTranscriptions : [];
        
        if (resetData) {
          setTranscriptions(transcriptionsArray);
          setCursor(responseCursor);
        } else {
          // Append to existing transcriptions for pagination
          setTranscriptions(prev => [...prev, ...transcriptionsArray]);
          setCursor(responseCursor);
        }
        
        setHasMore(!!responseCursor);
      } catch (error) {
        console.error("API Error:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to fetch transcriptions. Please check your API key.";
        toast.error(errorMessage);
        setTranscriptions([]);
      } finally {
        if (showLoadingState) setLoading(false);
      }
    },
    [selectedDate]
  );

  const loadMoreTranscriptions = React.useCallback(async () => {
    if (!hasMore || loading || !cursor) return;
    await fetchTranscriptions(false, false, cursor);
  }, [hasMore, loading, cursor, fetchTranscriptions]);

  const goToPreviousDay = () => {
    setSelectedDate(prev => subDays(prev, 1));
  };

  const goToNextDay = () => {
    setSelectedDate(prev => addDays(prev, 1));
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  React.useEffect(() => {
    fetchTranscriptions();
  }, [selectedDate, fetchTranscriptions]);

  const formatTranscriptionTime = (timestamp: string) => {
    try {
      return format(new Date(timestamp), "h:mm a");
    } catch {
      return timestamp;
    }
  };

  const formatActualTime = (transcriptionStartTime: string, offsetMs: number) => {
    try {
      const startTime = new Date(transcriptionStartTime);
      const actualTime = new Date(startTime.getTime() + offsetMs);
      return format(actualTime, "h:mm:ss a");
    } catch {
      // Fallback to offset time if date parsing fails
      const totalSeconds = Math.floor(offsetMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  };

  const renderTranscriptionContent = (transcription: Transcription) => {
    const textContents = transcription.contents.filter(content => 
      content.type === "blockquote" && content.content?.trim()
    );

    if (textContents.length === 0) {
      return <p className="text-sm text-muted-foreground italic">No transcription content available</p>;
    }

    // Reverse the content order so newest timestamps appear first
    const reversedContents = [...textContents].reverse();

    return (
      <div className="space-y-1">
        {reversedContents.map((content, index) => (
          <div key={index} className="flex items-start gap-2">
            {content.startOffsetMs !== undefined && (
              <span className="text-xs text-muted-foreground font-mono min-w-[60px] mt-0.5">
                {formatActualTime(transcription.startTime, content.startOffsetMs)}
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
    <div className="h-screen space-y-6 border rounded-xl p-6 overflow-auto overscroll-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Button
            onClick={goToPreviousDay}
            variant="outline"
            size="sm"
            className="hover:bg-accent/60 border-border/60 hover:border-border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-[240px] justify-start text-left font-normal border-border/60 hover:border-border transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] hover:shadow-sm"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                {format(selectedDate, "EEEE, MMM dd, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 border-border/60" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) {
                    setSelectedDate(date);
                  }
                }}
                initialFocus
                className="rounded-md border-0"
              />
            </PopoverContent>
          </Popover>
          
          <Button
            onClick={goToNextDay}
            variant="outline"
            size="sm"
            className="hover:bg-accent/60 border-border/60 hover:border-border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            onClick={goToToday}
            variant="outline"
            size="sm"
            className="hover:bg-accent/60 border-border/60 hover:border-border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            Today
          </Button>
          <Button
            onClick={() => fetchTranscriptions()}
            variant="outline"
            size="sm"
            disabled={loading}
            className="hover:bg-accent/60 border-border/60 hover:border-border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-sm disabled:opacity-50"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>
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
                        {formatTranscriptionTime(transcription.startTime)} - {formatTranscriptionTime(transcription.endTime)}
                      </span>
                      <span>
                        {format(new Date(transcription.updatedAt), "MMM dd, yyyy")}
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
          Showing {Array.isArray(transcriptions) ? transcriptions.length : 0} transcription{Array.isArray(transcriptions) && transcriptions.length !== 1 ? 's' : ''} for {format(selectedDate, "MMMM dd, yyyy")}
        </p>
      </div>
    </div>
  );
}