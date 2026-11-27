"use client";

import { Search, X } from "lucide-react";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function TimelineSearchButton({ active = false, onClick }: { active?: boolean; onClick: () => void }) {
  return <Tooltip><TooltipTrigger asChild>
    <Button type="button" variant="outline" size="icon" aria-label={active ? "Close search" : "Search time entries"} aria-expanded={active} onClick={onClick} className="h-9 w-9 rounded-full border-border/40 shadow-sm transition-colors hover:border-border">
      {active ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
    </Button>
  </TooltipTrigger><TooltipContent>{active ? "Close search" : "Search time entries"}</TooltipContent></Tooltip>;
}
