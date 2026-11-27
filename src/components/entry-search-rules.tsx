"use client";
import { Plus, X } from "lucide-react";
import { DESCRIPTION_MATCHES, MAX_SEARCH_RULES, descriptionMatch, type EntrySearch, type DescriptionMatch } from "@/lib/entry-search";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export function EntrySearchRules({ search, onChange, encrypted }: { search: EntrySearch; onChange: (search: EntrySearch) => void; encrypted: boolean }) {
  const rules = search.conditions ?? [];
  const update = (index: number, patch: Partial<typeof rules[number]>) => onChange({ ...search, conditions: rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule) });
  return <div className="max-w-[55rem] space-y-2">
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Select value={search.combine ?? "and"} onValueChange={combine => onChange({ ...search, combine: combine as "and" | "or" })}>
        <SelectTrigger aria-label="Combine search criteria" title="Combine text rules, project selection, and tag selection. The date range always applies." className="h-7 w-auto gap-2 border-0 bg-transparent px-2 text-xs text-muted-foreground shadow-none"><SelectValue /></SelectTrigger>
        <SelectContent data-entry-search-controls className="rounded-xl">
          <SelectItem value="and">Match all criteria (AND)</SelectItem>
          <SelectItem value="or">Match any criterion (OR)</SelectItem>
        </SelectContent>
      </Select>
      <Button type="button" variant="ghost" className="h-7 gap-1.5 rounded-md px-2 text-xs font-normal text-muted-foreground" disabled={encrypted || rules.length >= MAX_SEARCH_RULES} onClick={() => onChange({ ...search, conditions: [...rules, { match: "phrase", text: "" }] })}><Plus className="h-3 w-3" />Add description rule</Button>
    </div>
    {rules.length > 0 && <div className="ml-auto max-w-2xl space-y-2 rounded-xl border border-border/60 bg-muted/10 p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>Description rules</span><span>{search.combine === "or" ? "OR · any criterion" : "AND · all criteria"}</span></div>
      {rules.map((rule, index) => <div key={index} className="flex flex-wrap items-center gap-2">
        <Select value={rule.match} disabled={encrypted} onValueChange={match => update(index, { match: match as DescriptionMatch })}>
          <SelectTrigger aria-label={`Description rule ${index + 1} matching`} className="h-9 w-44 rounded-lg border-border/60 bg-background text-xs shadow-none"><SelectValue /></SelectTrigger>
          <SelectContent data-entry-search-controls className="rounded-xl">{DESCRIPTION_MATCHES.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
        <Input aria-label={`Description rule ${index + 1} text`} autoFocus={!encrypted && descriptionMatch(rule.match).needsText} maxLength={3000} value={descriptionMatch(rule.match).needsText ? rule.text : ""} disabled={encrypted || !descriptionMatch(rule.match).needsText} placeholder={descriptionMatch(rule.match).needsText ? "Text to match…" : "No text needed"} onChange={event => update(index, { text: event.target.value })} className="h-9 min-w-28 flex-1 rounded-lg border-border/60 bg-background text-sm shadow-none" />
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove description rule ${index + 1}`} className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground" onClick={() => onChange({ ...search, conditions: rules.filter((_, i) => i !== index) })}><X className="h-3.5 w-3.5" /></Button>
      </div>)}
      <p className="text-[11px] leading-relaxed text-muted-foreground">{search.combine === "or" ? "Match any text rule, selected project, or tag selection." : "Match every text rule, a selected project, and every selected tag."} The date range always applies.</p>
    </div>}
  </div>;
}
