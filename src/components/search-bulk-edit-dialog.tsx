"use client";
import * as React from "react";
import { format, parseISO } from "date-fns";
import { ArrowRight, Check, SlidersHorizontal } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { cn } from "@/lib/utils";
import type { TimeEntry, Project, Tag } from "@/types";
import { replaceEntryText } from "@/lib/entry-search";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";

export type SearchEntryEdit = { id: number; description?: string; project_id?: number | null; tags?: string[]; delete?: boolean };

export function SearchBulkEditDialog({ open, onOpenChange, entries, projects, tags, descriptionsLocked, onApply }: {
  open: boolean; onOpenChange: (open: boolean) => void; entries: TimeEntry[];
  projects: Project[]; tags: Tag[]; descriptionsLocked: boolean;
  onApply: (changes: SearchEntryEdit[]) => boolean | void;
}) {
  const [action, setAction] = React.useState("project");
  const [project, setProject] = React.useState("none");
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const [description, setDescription] = React.useState("");
  const [find, setFind] = React.useState("");
  const [replacement, setReplacement] = React.useState("");
  const descriptionAction = action === "description" || action === "replace";
  const changes: SearchEntryEdit[] = entries.map(entry => {
    if (action === "delete") return { id: entry.id, delete: true };
    if (action === "project") return { id: entry.id, project_id: project === "none" ? null : Number(project) };
    if (action === "description") return { id: entry.id, description };
    if (action === "replace") return { id: entry.id, description: replaceEntryText(entry.description, find, replacement) };
    return { id: entry.id, tags: action === "add-tags" ? [...new Set([...entry.tags, ...selectedTags])]
      : action === "remove-tags" ? entry.tags.filter(tag => !selectedTags.includes(tag)) : selectedTags };
  }).filter(change => {
    const entry = entries.find(entry => entry.id === change.id)!;
    return change.delete ? true : change.description !== undefined ? change.description !== entry.description
      : change.tags !== undefined ? JSON.stringify([...change.tags].sort()) !== JSON.stringify([...entry.tags].sort())
      : change.project_id !== entry.project_id;
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="flex max-h-[85dvh] flex-col gap-5 overflow-hidden rounded-2xl border-border/60 p-6 sm:max-w-lg">
    <DialogHeader className="shrink-0 space-y-2 text-left">
      <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-muted/30"><SlidersHorizontal className="h-4 w-4 text-muted-foreground" /></div>
      <DialogTitle className="text-lg font-medium tracking-tight">Edit selected entries</DialogTitle>
      <DialogDescription>{entries.length} {entries.length === 1 ? "entry" : "entries"} selected. Preview your changes. You have 30 seconds to undo before they are sent.</DialogDescription>
    </DialogHeader>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground" id="bulk-action-label">Action</span>
      <Select value={action} onValueChange={setAction}>
        <SelectTrigger aria-label="Bulk edit action" className="h-10 w-full rounded-lg border-border/60 shadow-none"><SelectValue /></SelectTrigger>
        <SelectContent className="rounded-xl border-border/60">
          <SelectItem value="project">Set project</SelectItem><SelectItem value="add-tags">Add tags</SelectItem><SelectItem value="remove-tags">Remove tags</SelectItem><SelectItem value="set-tags">Replace all tags</SelectItem>
          <SelectItem value="description" disabled={descriptionsLocked}>Set description</SelectItem><SelectItem value="replace" disabled={descriptionsLocked}>Find and replace</SelectItem><SelectItem value="delete">Delete entries</SelectItem>
        </SelectContent>
      </Select>
    </div>
    {action === "project" && <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground">Project</span>
      <Select value={project} onValueChange={setProject}>
        <SelectTrigger aria-label="Bulk project" className="h-10 w-full rounded-lg border-border/60 shadow-none"><SelectValue /></SelectTrigger>
        <SelectContent className="rounded-xl border-border/60"><SelectItem value="none">No project</SelectItem>{projects.map(project => <SelectItem key={project.id} value={String(project.id)}><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: project.color }} />{project.name}</span></SelectItem>)}</SelectContent>
      </Select>
    </div>}
    {action.endsWith("tags") && <fieldset className="max-h-48 overflow-auto rounded-lg border border-border/60 p-1.5"><legend className="px-1.5 text-xs font-medium text-muted-foreground">Tags</legend>{tags.map(tag => <label key={tag.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-accent/50">
      <input type="checkbox" className="peer sr-only" checked={selectedTags.includes(tag.name)} onChange={event => setSelectedTags(current => event.target.checked ? [...current, tag.name] : current.filter(name => name !== tag.name))} />
      <span className={cn("flex h-4 w-4 items-center justify-center rounded border border-border/80 peer-focus-visible:ring-2 peer-focus-visible:ring-ring", selectedTags.includes(tag.name) && "border-primary bg-primary text-primary-foreground")}><Check className={cn("h-3 w-3", !selectedTags.includes(tag.name) && "invisible")} /></span>{tag.name}
    </label>)}{!tags.length && <p className="p-4 text-center text-xs text-muted-foreground">No tags available</p>}</fieldset>}
    {action === "description" && <label className="space-y-2 text-xs font-medium text-muted-foreground">New description<Textarea className="min-h-24 rounded-lg border-border/60 text-sm font-normal text-foreground shadow-none" value={description} onChange={e => setDescription(e.target.value)} /></label>}
    {action === "replace" && <><label className="space-y-2 text-xs font-medium text-muted-foreground">Find<Input className="h-10 rounded-lg border-border/60 text-sm font-normal text-foreground shadow-none" value={find} onChange={e => setFind(e.target.value)} /></label><label className="space-y-2 text-xs font-medium text-muted-foreground">Replace with<Input className="h-10 rounded-lg border-border/60 text-sm font-normal text-foreground shadow-none" value={replacement} onChange={e => setReplacement(e.target.value)} /></label><p className="text-xs text-muted-foreground">Replaces every literal occurrence. Case-sensitive.</p></>}
    {action === "delete" && <p className="text-sm text-muted-foreground">These entries stay visible as pending deletions during the 30-second Undo window. Committed deletions cannot be undone.</p>}
    <div className="overflow-hidden rounded-xl border border-border/60 text-sm"><div className="flex items-center justify-between bg-muted/30 px-4 py-2.5 text-xs"><span className="font-medium">Preview</span><span className="text-muted-foreground">{changes.length} {changes.length === 1 ? "entry" : "entries"} will change</span></div>
      {changes.slice(0, 3).map(change => {
        const entry = entries.find(entry => entry.id === change.id)!;
        return <div key={change.id} className="space-y-2 border-t border-border/50 px-4 py-3 break-words">
          <p className="text-xs text-muted-foreground">{format(parseISO(entry.start), "MMM d, yyyy · h:mm a")}</p>
          <p className="line-clamp-3 text-muted-foreground">{change.delete ? entry.description || "No description" : descriptionAction ? entry.description || "(empty)" : change.tags ? entry.tags.join(", ") || "No tags" : entry.project_name || "No project"}</p>
          <p className="flex items-start gap-2"><ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" /><span className="line-clamp-3">{change.delete ? "Delete entry" : descriptionAction ? change.description || "(empty)" : change.tags ? change.tags.join(", ") || "No tags" : projects.find(project => project.id === change.project_id)?.name || "No project"}</span></p>
        </div>;
      })}
    </div>
    </div>
    <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 pt-4">
    <Button variant="ghost" className="rounded-lg font-normal text-muted-foreground" onClick={() => onOpenChange(false)}>Cancel</Button>
    <Button className="rounded-lg px-4 shadow-none" disabled={!changes.length || (action === "replace" && !find) || (descriptionAction && descriptionsLocked)} onClick={() => { if (onApply(changes) !== false) onOpenChange(false); }}>Apply to {changes.length} {changes.length === 1 ? "entry" : "entries"}</Button>
    </div>
  </DialogContent></Dialog>;
}
