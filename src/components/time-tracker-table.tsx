"use client";

import { endOfDay, format, startOfDay, subDays } from "date-fns";
import {
  Calendar as CalendarIcon,
  MoreVertical,
  RefreshCw,
} from "lucide-react";
import * as React from "react";
import { DateRange } from "react-day-picker";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ExpandableDescription } from "./expandable-description";
import { LiveDuration } from "./live-duration";
import { ProjectSelector } from "./project-selector";

type TimeEntry = {
  id: number;
  description: string;
  project_name: string;
  project_color: string;
  start: string;
  stop: string;
  duration: number;
};

type Project = {
  id: number;
  name: string;
  color: string;
};

export function TimeTrackerTable() {
  const getDefaultDateRange = (): DateRange => {
    const today = new Date();
    const sevenDaysAgo = subDays(today, 7);
    return {
      from: startOfDay(sevenDaysAgo),
      to: endOfDay(today),
    };
  };

  const [date, setDate] = React.useState<DateRange | undefined>(
    getDefaultDateRange()
  );
  const [timeEntries, setTimeEntries] = React.useState<TimeEntry[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);

  const handleDescriptionSave =
    (entryId: number) => (newDescription: string) => {
      const originalEntries = [...timeEntries];

      // Optimistically update UI
      setTimeEntries((prev) =>
        prev.map((entry) =>
          entry.id === entryId
            ? { ...entry, description: newDescription }
            : entry
        )
      );

      toast("Description updated.", {
        action: {
          label: "Undo",
          onClick: () => setTimeEntries(originalEntries),
        },
        onAutoClose: () => {
          // If not undone, make the API call (without showing success toast)
          fetch(`/api/time-entries/${entryId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ description: newDescription }),
          }).catch(() => {
            // If API fails, revert the change and show error
            toast.error("Failed to update description. Please try again.");
            setTimeEntries(originalEntries);
          });
        },
      });
    };

  const handleProjectChange = (entryId: number) => (newProject: string) => {
    const originalEntries = [...timeEntries];

    // Find the project color for optimistic update
    const selectedProject = projects.find((p) => p.name === newProject);
    const newProjectColor =
      newProject === "No Project" || newProject === ""
        ? "#6b7280"
        : selectedProject?.color || "#6b7280";

    // Optimistically update UI with both project name and color
    setTimeEntries((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              project_name: newProject || "No Project",
              project_color: newProjectColor,
            }
          : entry
      )
    );

    toast("Project updated.", {
      action: {
        label: "Undo",
        onClick: () => setTimeEntries(originalEntries),
      },
      onAutoClose: () => {
        // If not undone, make the API call
        fetch(`/api/time-entries/${entryId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ project_name: newProject }),
        }).catch(() => {
          // If API fails, revert the change and show error
          toast.error("Failed to update project. Please try again.");
          setTimeEntries(originalEntries);
        });
      },
    });
  };

  const handleDelete = (entryToDelete: TimeEntry) => {
    const originalEntries = [...timeEntries];
    // Optimistically update UI
    setTimeEntries(
      timeEntries.filter((entry) => entry.id !== entryToDelete.id)
    );

    toast("Time entry deleted.", {
      action: {
        label: "Undo",
        onClick: () => setTimeEntries(originalEntries),
      },
      onAutoClose: () => {
        // If not undone, make the API call
        fetch(`/api/time-entries/${entryToDelete.id}`, {
          method: "DELETE",
        }).catch(() => {
          // If API fails, revert the change and show error
          toast.error("Failed to delete entry. Please try again.");
          setTimeEntries(originalEntries);
        });
      },
    });
  };

  const fetchData = React.useCallback(
    async (showLoadingState = true) => {
      if (!date?.from || !date?.to) return;

      if (showLoadingState) setLoading(true);
      const fromISO = date.from.toISOString();
      const toISO = date.to.toISOString();

      // Get credentials from localStorage
      const apiKey = localStorage.getItem("toggl_api_key");

      try {
        const response = await fetch(
          `/api/time-entries?start_date=${fromISO}&end_date=${toISO}`,
          {
            headers: {
              "x-toggl-api-key": apiKey || "",
            },
          }
        );

        const data = await response.json();

        // Handle the new response structure
        if (data.timeEntries && data.projects) {
          setTimeEntries(data.timeEntries);
          setProjects(data.projects);
        } else {
          // Handle error or empty response
          setTimeEntries([]);
          setProjects([]);
        }
      } catch (error) {
        console.error("API Error:", error);
        toast.error("Failed to fetch data.");
      } finally {
        if (showLoadingState) setLoading(false);
      }
    },
    [date]
  );

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh data when tab becomes visible
  React.useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && date?.from && date?.to) {
        // Silently refresh data without showing loading state
        fetchData(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchData, date]);

  const paginatedEntries = timeEntries.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              id="date"
              variant={"outline"}
              className={cn(
                "w-[300px] justify-start text-left font-normal border-border/60 hover:border-border transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] hover:shadow-sm",
                !date && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
              {date?.from ? (
                date.to ? (
                  <>
                    {format(date.from, "LLL dd, y")} -{" "}
                    {format(date.to, "LLL dd, y")}
                  </>
                ) : (
                  format(date.from, "LLL dd, y")
                )
              ) : (
                <span>Pick a date range</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 border-border/60" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={(selectedRange) => {
                if (selectedRange?.from && selectedRange?.to) {
                  // Set end date to end of day
                  const endOfDayTo = endOfDay(selectedRange.to);
                  setDate({ from: selectedRange.from, to: endOfDayTo });
                } else {
                  setDate(selectedRange);
                }
              }}
              numberOfMonths={2}
              className="rounded-md border-0"
            />
          </PopoverContent>
        </Popover>
        <Button
          onClick={() => {
            fetchData();
          }}
          variant="outline"
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

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-muted-foreground animate-pulse">
              Loading time entries...
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 overflow-hidden shadow-sm bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-muted/30 transition-colors duration-200 border-border/60">
                <TableHead className="px-4 py-3 font-medium text-muted-foreground">
                  Description
                </TableHead>
                <TableHead className="px-4 py-3 w-48 font-medium text-muted-foreground">
                  Project
                </TableHead>
                <TableHead className="px-4 py-3 w-32 font-medium text-muted-foreground">
                  Time
                </TableHead>
                <TableHead className="px-4 py-3 w-24 font-medium text-muted-foreground">
                  Duration
                </TableHead>
                <TableHead className="px-4 py-3 w-16 font-medium text-muted-foreground"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedEntries.map((entry) => (
                <TableRow
                  key={entry.id}
                  className="hover:bg-accent/20 transition-all duration-200 border-border/40 group hover:shadow-sm"
                >
                  <TableCell className="px-4 py-2 max-w-0 w-full">
                    <ExpandableDescription
                      description={entry.description || ""}
                      onSave={(newDescription) =>
                        handleDescriptionSave(entry.id)(newDescription)
                      }
                    />
                  </TableCell>
                  <TableCell className="px-4 py-2">
                    <ProjectSelector
                      currentProject={entry.project_name || ""}
                      currentProjectColor={entry.project_color}
                      onProjectChange={(newProject) =>
                        handleProjectChange(entry.id)(newProject)
                      }
                      projects={projects}
                    />
                  </TableCell>
                  <TableCell className="px-4 py-2 font-mono text-sm text-muted-foreground">
                    {format(new Date(entry.start), "h:mm a")} -{" "}
                    {entry.stop
                      ? format(new Date(entry.stop), "h:mm a")
                      : "Now"}
                  </TableCell>
                  <TableCell className="px-4 py-2 font-mono text-sm">
                    <LiveDuration
                      startTime={entry.start}
                      stopTime={entry.stop}
                      staticDuration={entry.duration}
                      className="group-hover:text-accent-foreground transition-colors duration-200"
                    />
                  </TableCell>
                  <TableCell className="px-4 py-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-accent/60 hover:scale-110 active:scale-95"
                        >
                          <span className="sr-only">Open menu</span>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-40 border-border/60"
                      >
                        <DropdownMenuItem
                          onClick={() => {
                            // Implement duplicate logic
                          }}
                          className="cursor-pointer hover:bg-accent/60 transition-colors duration-150"
                        >
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            // Implement split logic
                          }}
                          className="cursor-pointer hover:bg-accent/60 transition-colors duration-150"
                        >
                          Split
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            // Implement start entry logic
                          }}
                          className="cursor-pointer hover:bg-accent/60 transition-colors duration-150"
                        >
                          Start entry
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            // Implement copy ID logic
                          }}
                          className="cursor-pointer hover:bg-accent/60 transition-colors duration-150"
                        >
                          Copy ID
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(entry)}
                          className="cursor-pointer text-destructive focus:text-destructive hover:bg-destructive/10 transition-colors duration-150"
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {page * rowsPerPage + 1} to{" "}
          {Math.min((page + 1) * rowsPerPage, timeEntries.length)} of{" "}
          {timeEntries.length} entries
        </p>
        <div className="flex items-center space-x-6 lg:space-x-8">
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium">Rows per page</p>
            <Select
              value={`${rowsPerPage}`}
              onValueChange={(value) => {
                setRowsPerPage(Number(value));
                setPage(0);
              }}
            >
              <SelectTrigger className="h-8 w-[70px] border-border/60 hover:border-border transition-colors duration-200">
                <SelectValue placeholder={rowsPerPage} />
              </SelectTrigger>
              <SelectContent side="top" className="border-border/60">
                {[10, 20, 30, 40, 50].map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-[100px] items-center justify-center text-sm font-medium">
            Page {page + 1} of {Math.ceil(timeEntries.length / rowsPerPage)}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              className="h-8 w-8 p-0 border-border/60 hover:border-border transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
              onClick={() => setPage(0)}
              disabled={page === 0}
            >
              <span className="sr-only">Go to first page</span>
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 17l-5-5 5-5M18 17l-5-5 5-5"
                />
              </svg>
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0 border-border/60 hover:border-border transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
              onClick={() => setPage(page - 1)}
              disabled={page === 0}
            >
              <span className="sr-only">Go to previous page</span>
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0 border-border/60 hover:border-border transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
              onClick={() => setPage(page + 1)}
              disabled={page >= Math.ceil(timeEntries.length / rowsPerPage) - 1}
            >
              <span className="sr-only">Go to next page</span>
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0 border-border/60 hover:border-border transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
              onClick={() =>
                setPage(Math.ceil(timeEntries.length / rowsPerPage) - 1)
              }
              disabled={page >= Math.ceil(timeEntries.length / rowsPerPage) - 1}
            >
              <span className="sr-only">Go to last page</span>
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 17l5-5-5-5M6 17l5-5-5-5"
                />
              </svg>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
