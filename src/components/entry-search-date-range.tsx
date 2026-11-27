"use client";
import * as React from "react";
import { format, parseISO, startOfDay, subDays } from "date-fns";
import { CalendarDays, ChevronDown } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export function EntrySearchDateRange({ value, presetEnd, onChange, triggerRef }: {
  value: { from: string; to: string }; presetEnd: string;
  onChange: (from: string, to: string) => void; triggerRef?: React.Ref<HTMLButtonElement>;
}) {
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [rangeStart, setRangeStart] = React.useState<Date | null>(null);
  const [wide, setWide] = React.useState(false);
  React.useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setWide(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const fromDate = parseISO(value.from), toDate = parseISO(value.to);
  const dateLabel = value.from === value.to ? format(fromDate, "LLL d, y")
    : `${format(fromDate, fromDate.getFullYear() === toDate.getFullYear() ? "LLL d" : "LLL d, y")} – ${format(toDate, "LLL d, y")}`;
  const range: DateRange = rangeStart ? { from: rangeStart } : { from: fromDate, to: toDate };
  const chooseRange = (from: Date, to: Date) => {
    onChange(format(from, "yyyy-MM-dd"), format(to, "yyyy-MM-dd"));
    setRangeStart(null); setCalendarOpen(false);
  };
  return (
    <Popover open={calendarOpen} onOpenChange={open => { setCalendarOpen(open); setRangeStart(null); }}>
        <PopoverTrigger asChild>
          <Button ref={triggerRef} type="button" variant="outline" aria-label="Search date range" title="Dates (⌥D). Both dates are included in your Toggl profile timezone." className="h-10 max-w-full justify-start gap-2 border-border/60 bg-background text-left font-normal shadow-none hover:bg-accent/50">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{dateLabel}</span>
            <ChevronDown className="ml-1 h-3 w-3 text-muted-foreground/60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent data-entry-search-controls align="start" className="w-auto max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border-border/60 p-0 shadow-lg">
          <Calendar mode="range" defaultMonth={fromDate} selected={range} numberOfMonths={wide ? 2 : 1} className="border-0 p-4" onSelect={(_selected, day) => {
            const clicked = startOfDay(day);
            if (!rangeStart) { setRangeStart(clicked); return; }
            chooseRange(clicked < rangeStart ? clicked : rangeStart, clicked < rangeStart ? rangeStart : clicked);
          }} />
          <div className="flex flex-wrap gap-1 border-t border-border/60 bg-muted/20 p-2">
            {[7, 30, 90].map(days => <Button key={days} type="button" variant="ghost" size="sm" className="h-7 rounded-md px-2 text-xs font-normal text-muted-foreground" onClick={() => { const end = parseISO(presetEnd); chooseRange(subDays(end, days - 1), end); }}>Last {days} days</Button>)}
            <Button type="button" variant="ghost" size="sm" className="h-7 rounded-md px-2 text-xs font-normal text-muted-foreground" onClick={() => { const end = parseISO(presetEnd); chooseRange(new Date(end.getFullYear(), 0, 1), end); }}>This year</Button>
          </div>
        </PopoverContent>
      </Popover>
  );
}
