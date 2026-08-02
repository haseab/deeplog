export interface LimitlessTranscriptionContent {
  type: "heading1" | "heading2" | "heading3" | "blockquote";
  content: string;
  speakerName?: string;
  startTime?: string;
  endTime?: string;
  startOffsetMs?: number;
  endOffsetMs?: number;
}

export interface LimitlessLifelog {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  contents: LimitlessTranscriptionContent[];
  updatedAt: string;
  markdown?: string;
}

export interface LimitlessPage {
  lifelogs: LimitlessLifelog[];
  nextCursor: string | null;
}

export interface FetchLimitlessPageOptions {
  apiKey: string;
  params: URLSearchParams;
  signal?: AbortSignal;
  endpoint?: string;
  apiKeyHeader?: string;
}

export interface FetchTimeRangeWithPrecedingOptions {
  apiKey: string;
  startTime: Date;
  endTime: Date;
  limit?: number;
  signal?: AbortSignal;
  endpoint?: string;
  apiKeyHeader?: string;
}

const parseLimitlessPage = (data: unknown): LimitlessPage => {
  const response = data as {
    data?: { lifelogs?: unknown };
    lifelogs?: unknown;
    meta?: { lifelogs?: { nextCursor?: unknown } };
  };
  const lifelogs = response.data?.lifelogs ?? response.lifelogs;
  const nextCursor = response.meta?.lifelogs?.nextCursor;

  return {
    lifelogs: Array.isArray(lifelogs)
      ? (lifelogs as LimitlessLifelog[])
      : [],
    nextCursor: typeof nextCursor === "string" ? nextCursor : null,
  };
};

export const fetchLimitlessPage = async ({
  apiKey,
  params,
  signal,
  endpoint = "/api/limitless",
  apiKeyHeader = "x-limitless-api-key",
}: FetchLimitlessPageOptions): Promise<LimitlessPage> => {
  const response = await fetch(`${endpoint}?${params.toString()}`, {
    headers: { [apiKeyHeader]: apiKey },
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(
      errorData?.error || `HTTP ${response.status}: ${response.statusText}`
    );
  }

  return parseLimitlessPage(await response.json());
};

// Fetch the requested window and, independently, the closest lifelog that
// begins on or before its start. The preceding lookup is best-effort, and its
// cursor never replaces the primary range's pagination cursor.
export const fetchLimitlessTimeRangeWithPreceding = async ({
  apiKey,
  startTime,
  endTime,
  limit = 20,
  signal,
  endpoint,
  apiKeyHeader,
}: FetchTimeRangeWithPrecedingOptions): Promise<LimitlessPage> => {
  const sharedParams = {
    includeMarkdown: "true",
    includeHeadings: "true",
    includeContents: "true",
  };
  const rangeParams = new URLSearchParams({
    ...sharedParams,
    start: startTime.toISOString(),
    end: endTime.toISOString(),
    limit: limit.toString(),
    direction: "desc",
  });
  const precedingParams = new URLSearchParams({
    ...sharedParams,
    end: startTime.toISOString(),
    limit: "1",
    direction: "desc",
  });

  const [rangePage, precedingResult] = await Promise.all([
    fetchLimitlessPage({
      apiKey,
      params: rangeParams,
      signal,
      endpoint,
      apiKeyHeader,
    }),
    fetchLimitlessPage({
      apiKey,
      params: precedingParams,
      signal,
      endpoint,
      apiKeyHeader,
    }).catch((error) => {
      if (signal?.aborted) throw error;
      console.warn(
        "Could not fetch the lifelog preceding the requested time:",
        error
      );
      return null;
    }),
  ]);
  const lifelogs = Array.from(
    new Map(
      [
        ...rangePage.lifelogs,
        ...(precedingResult?.lifelogs ?? []),
      ].map((lifelog) => [lifelog.id, lifelog])
    ).values()
  ).sort(
    (a, b) =>
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );

  return {
    lifelogs,
    nextCursor: rangePage.nextCursor,
  };
};
