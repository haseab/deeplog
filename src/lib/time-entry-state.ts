type RunningTimeEntry = {
  id: number;
  start: string;
  stop?: string | null;
  duration: number;
};

export function isRunningTimeEntry(
  entry: Pick<RunningTimeEntry, "stop" | "duration">
): boolean {
  return !entry.stop || entry.duration < 0;
}

export function stopTimeEntryAt<T extends RunningTimeEntry>(
  entry: T,
  requestedStop: string
): T {
  const startTime = new Date(entry.start).getTime();
  const requestedStopTime = new Date(requestedStop).getTime();
  const validStopTime = Math.max(startTime, requestedStopTime);

  return {
    ...entry,
    stop: new Date(validStopTime).toISOString(),
    duration: Math.max(0, Math.floor((validStopTime - startTime) / 1000)),
  };
}

export function enforceSingleRunningTimeEntry<T extends RunningTimeEntry>(
  entries: T[],
  preferredActiveId?: number
): T[] {
  const runningEntries = entries.filter(isRunningTimeEntry);
  if (runningEntries.length <= 1) return entries;

  const preferredEntry = runningEntries.find(
    (entry) => entry.id === preferredActiveId
  );
  const activeEntry =
    preferredEntry ??
    runningEntries.reduce((latest, entry) =>
      new Date(entry.start).getTime() > new Date(latest.start).getTime()
        ? entry
        : latest
    );

  return entries.map((entry) =>
    entry.id !== activeEntry.id && isRunningTimeEntry(entry)
      ? stopTimeEntryAt(entry, activeEntry.start)
      : entry
  );
}

