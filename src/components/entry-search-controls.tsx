"use client";

import * as React from "react";
import { ArrowRight, Check, ChevronDown, Folder, Loader2, Search, SlidersHorizontal, Tag as TagIcon, X } from "lucide-react";
import { DESCRIPTION_MATCHES, descriptionMatch, validDescriptionConditions, type EntrySearch } from "@/lib/entry-search";
import { EntrySearchRules } from "./entry-search-rules";
import type { Project, Tag } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { EntrySearchDateRange } from "./entry-search-date-range";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

const filterStyle = "h-10 gap-2 border-border/60 bg-background font-normal shadow-none transition-colors hover:border-border hover:bg-accent/50";

function SearchFilter({ label, icon: Icon, items, selected, onChange, triggerRef, integrated = false }: {
  label: string; icon: typeof Folder; items: { id: string | number; name: string; color?: string }[];
  selected: string[]; onChange: (ids: string[]) => void; triggerRef?: React.Ref<HTMLButtonElement>; integrated?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();
  const listRef = React.useRef<HTMLDivElement>(null);
  const visible = items.filter(item => item.name.toLowerCase().includes(query.toLowerCase()));
  const activeIndex = Math.max(0, visible.findIndex(item => String(item.id) === activeId));
  const activeOption = visible[activeIndex];
  const activeOptionId = activeOption ? `${listId}-${activeOption.id}` : undefined;
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id]);
  React.useEffect(() => {
    if (open && activeOptionId) listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, activeOptionId]);
  return <Popover open={open} onOpenChange={next => { setOpen(next); setQuery(""); setActiveId(null); }}>
    <PopoverTrigger asChild>
      <Button ref={triggerRef} type="button" variant="outline" aria-label={`Filter ${label.toLowerCase()}`} title={`${label} (⌥${label === "Projects" ? "P" : "T"})`} className={cn(filterStyle, integrated && "border-transparent bg-transparent px-3 hover:border-transparent", selected.length > 0 && "bg-accent/50 text-foreground")}>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" /><span data-filter-label>{label}</span>
        {selected.length > 0 ? <span className="flex h-5 min-w-5 items-center justify-center rounded bg-foreground/8 px-1 text-[11px] font-medium tabular-nums">{selected.length}</span> : <ChevronDown className="h-3 w-3 text-muted-foreground/60" />}
      </Button>
    </PopoverTrigger>
    <PopoverContent data-entry-search-controls align="start" className="flex max-h-[var(--radix-popover-content-available-height)] w-72 flex-col rounded-xl border-border/60 p-1.5 shadow-lg">
      <div className="relative shrink-0 border-b border-border/50 px-1 pb-2 pt-1">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input ref={inputRef} role="combobox" aria-label={`Find ${label.toLowerCase()}`} aria-expanded={open} aria-controls={listId}
          aria-autocomplete="list" aria-activedescendant={activeOptionId}
          placeholder={`Find ${label.toLowerCase()}…`} value={query}
          onChange={event => { setQuery(event.target.value); setActiveId(null); }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
            if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
              event.preventDefault(); event.stopPropagation();
              if (!visible.length) return;
              if (event.key === "Enter") toggle(String(activeOption.id));
              else setActiveId(String(visible[(activeIndex + (event.key === "ArrowDown" ? 1 : -1) + visible.length) % visible.length].id));
            }
          }} className="h-8 border-0 bg-muted/40 pl-8 text-sm shadow-none focus-visible:ring-1" />
      </div>
      <div ref={listRef} id={listId} role="listbox" aria-label={label} aria-multiselectable="true" className="min-h-0 max-h-60 overflow-y-auto py-1">
        {visible.map(item => {
          const checked = selected.includes(String(item.id));
          return <label key={item.id} id={`${listId}-${item.id}`} role="option" aria-selected={checked}
            data-active={activeOption?.id === item.id} onPointerMove={() => setActiveId(String(item.id))}
            className={cn("flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-accent/60", activeOption?.id === item.id && "bg-accent text-accent-foreground") }>
            <input type="checkbox" tabIndex={-1} aria-hidden="true" className="sr-only peer" checked={checked} onChange={() => { toggle(String(item.id)); inputRef.current?.focus(); }} />
            <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border/80 peer-focus-visible:ring-2 peer-focus-visible:ring-ring", checked && "border-primary bg-primary text-primary-foreground")}><Check className={cn("h-3 w-3", !checked && "invisible")} /></span>
            {item.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />}
            <span className="min-w-0 truncate">{item.name}</span>
          </label>;
        })}
        {!visible.length && <p className="px-3 py-6 text-center text-xs text-muted-foreground">No {label.toLowerCase()} found</p>}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-border/50 px-2 py-1.5 text-xs text-muted-foreground">
        <span>{label === "Tags" ? "Match every selected tag" : "Match any selected project"}</span>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs" disabled={!selected.length} onClick={() => onChange([])}>Clear</Button>
      </div>
    </PopoverContent>
  </Popover>;
}

type EntrySearchControlsProps = {
  initial: EntrySearch; projects: Project[]; tags: Tag[]; busy: boolean; encrypted: boolean;
  onSearch: (search: EntrySearch) => void; compact?: boolean; hideDate?: boolean; dateRange?: { from: string; to: string };
};

export function EntrySearchControls({ initial, projects, tags, busy, encrypted, onSearch, compact = false, hideDate = false, dateRange }: EntrySearchControlsProps) {
  const [draft, setDraft] = React.useState(initial);
  const calendarFrom = dateRange?.from;
  const calendarTo = dateRange?.to;
  React.useEffect(() => {
    if (calendarFrom && calendarTo) setDraft(current => ({ ...current, from: calendarFrom, to: calendarTo }));
  }, [calendarFrom, calendarTo]);
  const matching = descriptionMatch(draft.match);
  const rulesValid = encrypted || validDescriptionConditions(draft.conditions ?? []);
  const textValid = encrypted || !matching.needsText || draft.match === "phrase" || !!draft.text.trim();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dateRef = React.useRef<HTMLButtonElement>(null);
  const projectRef = React.useRef<HTMLButtonElement>(null);
  const tagRef = React.useRef<HTMLButtonElement>(null);
  const [matchOpen, setMatchOpen] = React.useState(false);
  const selectedFilters = [
    ...draft.projects.map(id => ({ key: "projects" as const, id, name: id === "none" ? "No project" : projects.find(project => String(project.id) === id)?.name ?? "Project" })),
    ...draft.tags.map(id => ({ key: "tags" as const, id, name: tags.find(tag => String(tag.id) === id)?.name ?? "Tag" })),
  ];
  const dateControl = <EntrySearchDateRange value={draft} presetEnd={initial.to} triggerRef={dateRef} onChange={(from, to) => setDraft(current => ({ ...current, from, to }))} />;
  const filters = <div role="group" aria-label="Search filters" className="flex shrink-0 items-center gap-0.5"><SearchFilter integrated triggerRef={projectRef} label="Projects" icon={Folder} items={[{ id: "none", name: "No project" }, ...projects]} selected={draft.projects} onChange={projects => setDraft(current => ({ ...current, projects }))} />
      <SearchFilter integrated triggerRef={tagRef} label="Tags" icon={TagIcon} items={tags} selected={draft.tags} onChange={tags => setDraft(current => ({ ...current, tags }))} /></div>;
  const searchField = <div className={cn("relative flex min-w-0 flex-1 items-center rounded-lg border border-transparent bg-transparent transition-colors focus-within:border-border focus-within:bg-background focus-within:ring-2 focus-within:ring-ring/10", compact && "lg:max-w-[20rem] lg:flex-[0_1_20rem]")}>
        <Search className="ml-3.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <Input ref={inputRef} autoFocus={!encrypted} className="h-10 min-w-0 border-0 bg-transparent px-3 shadow-none focus-visible:border-transparent focus-visible:ring-0 md:text-sm" aria-label="Search descriptions" maxLength={3000} placeholder={matching.needsText ? "Search past entries…" : "No text needed"} value={matching.needsText ? draft.text : ""} disabled={encrypted || !matching.needsText} onChange={event => setDraft({ ...draft, text: event.target.value })} />
        <Popover open={matchOpen} onOpenChange={setMatchOpen}>
          <PopoverTrigger asChild><Button type="button" aria-label="Description matching" disabled={encrypted} title={matching.label} variant="ghost" className="mr-1.5 h-7 shrink-0 gap-1.5 rounded-md px-2 text-xs font-normal text-muted-foreground hover:text-foreground"><span data-matching-label>{matching.short}</span><ChevronDown className="h-3 w-3" /></Button></PopoverTrigger>
          <PopoverContent data-entry-search-controls align="end" className="max-h-80 w-64 overflow-y-auto rounded-xl border-border/60 p-1.5">
            {DESCRIPTION_MATCHES.map(option => <Button key={option.value} type="button" variant="ghost" className="h-9 w-full justify-start gap-3 px-3 text-left text-sm font-normal" onClick={() => { setDraft({ ...draft, match: option.value }); setMatchOpen(false); if (option.needsText) requestAnimationFrame(() => inputRef.current?.focus()); }}><Check className={cn("h-3.5 w-3.5 shrink-0", draft.match !== option.value && "invisible")} />{option.label}</Button>)}
          </PopoverContent>
        </Popover>
      </div>;
  const submitButton = <Button type="submit" aria-label={busy ? "Searching" : "Search"} className={cn("h-10 shrink-0 gap-2 rounded-lg shadow-none", compact ? "px-2 sm:px-3" : "px-4 sm:px-5")} disabled={busy || !draft.from || !draft.to || draft.from > draft.to || !rulesValid || !textValid}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}<span className={compact ? "hidden sm:inline" : undefined}>{busy ? "Searching" : "Search"}</span>{compact && !busy && <ArrowRight className="h-4 w-4 sm:hidden" />}</Button>;
  const details = <><EntrySearchRules search={draft} onChange={setDraft} encrypted={encrypted} />{selectedFilters.length > 0 && <div className="flex flex-wrap gap-1.5">{selectedFilters.map(filter => <Button key={`${filter.key}-${filter.id}`} type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setDraft(current => ({ ...current, [filter.key]: current[filter.key].filter(id => id !== filter.id) }))}>{filter.name}<X className="h-3 w-3" /></Button>)}</div>}{encrypted && <p className="text-xs text-muted-foreground">Encrypted descriptions cannot be searched. Use dates, projects, or tags.</p>}</>;
  return <form data-entry-search-controls data-compact={compact || undefined} className={cn("w-full", compact ? "flex h-9 min-w-0 items-center gap-2 [&_input]:h-8 [&_button]:h-8 [&_[data-filter-label]]:hidden xl:[&_[data-filter-label]]:inline max-lg:[&_[data-matching-label]]:hidden max-lg:[&_[aria-label^=Filter]_svg:last-child]:hidden [&_[aria-label^=Filter]]:px-2 xl:[&_[aria-label^=Filter]]:px-3" : "space-y-3")} onKeyDown={event => {
    if (event.altKey && !event.metaKey && !event.ctrlKey) {
      if (hideDate && event.code === "KeyD") {
        event.preventDefault(); event.stopPropagation();
        Array.from(document.querySelectorAll<HTMLButtonElement>("#date, #date-mobile")).find(button => button.offsetParent !== null)?.click();
        return;
      }
      const target = ({ d: dateRef, p: projectRef, t: tagRef } as const)[(event.code.startsWith("Key") ? event.code.slice(3).toLowerCase() : event.key.toLowerCase()) as "d" | "p" | "t"]?.current;
      if (target) { event.preventDefault(); event.stopPropagation(); target.focus(); target.click(); }
    }
  }} onSubmit={event => { event.preventDefault(); if (rulesValid && textValid) onSearch(encrypted ? { ...draft, text: "", match: "phrase", conditions: [] } : draft); }}>
    {compact ? <>
      {!hideDate && <div className="min-w-0 shrink-0 max-w-[42%] [&_button]:gap-1.5 [&_button]:px-2 [&_button]:text-xs max-lg:[&_button_span]:hidden max-lg:[&_button_svg:last-child]:hidden">{dateControl}</div>}
      <div role="search" aria-label="Entry search" className="flex h-9 min-w-0 flex-1 items-center rounded-xl border border-border/60 bg-muted/20 p-0.5 lg:max-w-[48rem] lg:gap-2 lg:px-1.5 [&_[aria-label='Search_filters']]:gap-0 lg:[&_[aria-label='Search_filters']]:gap-1.5">
        {searchField}{filters}
        <Popover><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="Advanced search rules" className="h-8 w-7 shrink-0 rounded-lg text-muted-foreground"><SlidersHorizontal className="h-3.5 w-3.5" /></Button></PopoverTrigger><PopoverContent data-entry-search-controls align="end" className="w-[min(36rem,calc(100vw-2rem))] space-y-3 rounded-xl p-3">{details}</PopoverContent></Popover>
        {submitButton}
      </div>
    </> : <>
    <div className="max-w-full pb-1">
      <div className="flex min-w-0 flex-col items-start gap-3 lg:flex-row lg:items-center">
        {dateControl}
        <div role="search" aria-label="Entry search" className="flex w-full min-w-0 max-w-[40rem] flex-wrap items-center gap-0.5 rounded-xl border border-border/60 bg-muted/20 p-1 focus-within:border-border focus-within:ring-2 focus-within:ring-ring/10 sm:flex-nowrap">
          <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">{searchField}</div><span className="mx-1 hidden h-5 w-px shrink-0 bg-border/60 sm:block" />{filters}<div className="ml-auto shrink-0">{submitButton}</div>
        </div>
      </div>
    </div>
    <EntrySearchRules search={draft} onChange={setDraft} encrypted={encrypted} />
    {selectedFilters.length > 0 && <div className="flex flex-wrap items-center gap-1.5">
      {selectedFilters.map(filter => <button key={`${filter.key}-${filter.id}`} type="button" aria-label={`Remove ${filter.name} ${filter.key === "projects" ? "project" : "tag"} filter`} onClick={() => setDraft(current => ({ ...current, [filter.key]: current[filter.key].filter(id => id !== filter.id) }))} className="inline-flex max-w-60 items-center gap-1.5 rounded-md bg-accent/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">{filter.key === "projects" ? <Folder className="h-3 w-3 shrink-0" /> : <TagIcon className="h-3 w-3 shrink-0" />}<span className="truncate">{filter.name}</span><X className="h-3 w-3 shrink-0" /></button>)}
      <Button type="button" variant="ghost" className="h-6 px-2 text-xs font-normal text-muted-foreground" onClick={() => setDraft(current => ({ ...current, projects: [], tags: [] }))}>Clear filters</Button>
    </div>}
    {encrypted && <p className="text-xs text-muted-foreground">Encrypted descriptions cannot be searched. Use dates, projects, or tags.</p>}
    </>}
  </form>;
}
