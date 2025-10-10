"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import Link from "@tiptap/extension-link";
import { Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import TurndownService from "turndown";
import { RecentTimersPopover } from "./recent-timers-popover";

type Project = {
  id: number;
  name: string;
  color: string;
};

type Tag = {
  id: number;
  name: string;
};

interface ExpandableDescriptionProps {
  description: string;
  onSave?: (newDescription: string) => void;
  onEditingChange?: (isEditing: boolean) => void;
  onNavigateNext?: () => void;
  projects?: Project[];
  availableTags?: Tag[];
  onRecentTimerSelect?: (entry: {
    description: string;
    projectId: number | null;
    tagIds: number[];
  }) => void;
  "data-testid"?: string;
}

export function ExpandableDescription({
  description,
  onSave,
  onEditingChange,
  onNavigateNext,
  projects = [],
  availableTags = [],
  onRecentTimerSelect,
  "data-testid": dataTestId,
}: ExpandableDescriptionProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [showLinkDialog, setShowLinkDialog] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState("");
  const [linkText, setLinkText] = React.useState("");
  const [triggerPosition, setTriggerPosition] = React.useState({ x: 0, y: 0 });
  const [currentCharCount, setCurrentCharCount] = React.useState(0);
  const [showRecentTimers, setShowRecentTimers] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const justSelectedTimerRef = React.useRef(false);
  const recentTimersRef = React.useRef<Array<{
    description: string;
    projectId: number | null;
    tagIds: number[];
  }>>([]);

  const MAX_CHARS = 3000;

  // Initialize Turndown service for HTML to markdown conversion
  const turndownService = React.useMemo(() => {
    const service = new TurndownService({
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
    });

    // Keep link formatting as markdown
    service.addRule("links", {
      filter: "a",
      replacement: function (content: string, node: Node) {
        const href = (node as HTMLAnchorElement).getAttribute("href") || "";
        const title = (node as HTMLAnchorElement).getAttribute("title");
        return title
          ? `[${content}](${href} "${title}")`
          : `[${content}](${href})`;
      },
    });

    return service;
  }, []);

  // Convert markdown to HTML for TipTap
  const markdownToHtml = React.useCallback((markdown: string): string => {
    if (!markdown) return "";

    // Simple markdown to HTML conversion
    const html = markdown
      // Convert links: [text](url) or [text](url "title")
      .replace(
        /\[([^\]]+)\]\(([^)]+?)(?:\s+"([^"]+)")?\)/g,
        (match, text, url, title) => {
          const titleAttr = title ? ` title="${title}"` : "";
          return `<a href="${url}"${titleAttr}>${text}</a>`;
        }
      )
      // Convert bold: **text** or __text__
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.*?)__/g, "<strong>$1</strong>")
      // Convert italic: *text* or _text_
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/_(.*?)_/g, "<em>$1</em>")
      // Convert line breaks
      .replace(/\n/g, "<br>");

    return html;
  }, []);

  // Create a ref for the editor to avoid dependency issues
  const editorRef = React.useRef<Editor>(null);

  const getMarkdownContent = React.useCallback(() => {
    if (!editorRef.current) return "";
    const html = editorRef.current.getHTML();
    const markdown = turndownService.turndown(html);
    // Unescape markdown special characters that Turndown escapes
    // We want to keep the plain text as-is
    return markdown
      .replace(/\\_/g, '_')  // Unescape underscores
      .replace(/\\\*/g, '*')  // Unescape asterisks
      .replace(/\\\[/g, '[')  // Unescape brackets
      .replace(/\\\]/g, ']')
      .replace(/\\#/g, '#')   // Unescape hashes
      .replace(/\\`/g, '`');  // Unescape backticks
  }, [turndownService]);

  // Notify parent of editing state changes
  React.useEffect(() => {
    console.log(`[ExpandableDescription] 📝 isEditing state changed:`, isEditing);
    onEditingChange?.(isEditing);
  }, [isEditing, onEditingChange]);

  // Handle click outside to save and close editor
  React.useEffect(() => {
    if (!isEditing || !editorRef.current) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Find the editor container
      const editorContainer = document.querySelector(".editor-container");
      if (!editorContainer) return;

      // Check if click is outside the editor container
      if (!editorContainer.contains(target)) {
        // Also check if it's not the link dialog
        const popoverContent = document.querySelector('[role="dialog"]');
        if (popoverContent && popoverContent.contains(target)) {
          return; // Clicked in dialog, don't close
        }

        // Save and close
        const newContent = getMarkdownContent();
        if (newContent !== description) {
          onSave?.(newContent);
        }
        setIsEditing(false);
      }
    };

    // Add listener
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isEditing, description, getMarkdownContent, onSave]);

  // Update character count when editor content changes
  const updateCharCount = React.useCallback(() => {
    if (editorRef.current) {
      const content = getMarkdownContent();
      setCurrentCharCount(content.length);
      // Update search query for recent timers
      setSearchQuery(content);
    }
  }, [getMarkdownContent]);

  const isOverLimit = currentCharCount > MAX_CHARS;
  const remainingChars = MAX_CHARS - currentCharCount;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        codeBlock: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-500 hover:underline transition-colors",
        },
      }),
    ],
    content: markdownToHtml(description),
    editorProps: {
      attributes: {
        class: `prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[24px] p-3 border rounded-md resize-none leading-tight transition-all duration-200 ${
          isOverLimit
            ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
            : "border-border/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
        }`,
      },
      handleKeyDown: (view, event) => {
        // Handle arrow keys when recent timers popover is open
        if (showRecentTimers) {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlightedIndex((prev) => {
              // Need to get count from the popover, but we'll handle it there
              return prev + 1;
            });
            return true;
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlightedIndex((prev) => Math.max(0, prev - 1));
            return true;
          } else if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
            event.preventDefault();
            // Trigger selection of highlighted item
            const selectedTimer = recentTimersRef.current[highlightedIndex];
            if (selectedTimer && onRecentTimerSelect) {
              justSelectedTimerRef.current = true;
              onRecentTimerSelect(selectedTimer);
              setShowRecentTimers(false);
              setIsEditing(false);
              setHighlightedIndex(0);
              // Stay in current cell, don't navigate down
            }
            return true;
          } else if (event.key === "Escape") {
            event.preventDefault();
            setShowRecentTimers(false);
            setHighlightedIndex(0);
            return true;
          }
          // For any other key when popover is open, let it through to the editor
          // so user can continue typing
          return false;
        }

        // Handle Space to show recent timers
        if (event.key === " " && !showRecentTimers) {
          setShowRecentTimers(true);
          setHighlightedIndex(0);
          // Maintain focus on the editor after popover opens
          setTimeout(() => {
            editor?.commands.focus();
          }, 0);
          // Don't prevent default - let the space be typed
          return false;
        }

        // Handle Command/Ctrl + Enter to save and exit
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          event.stopPropagation();

          saveAndExit();

          // Add a subtle flash effect for the keyboard shortcut
          const editorElement = view.dom.closest(".editor-container");
          editorElement?.classList.add("flash-success");
          setTimeout(() => {
            editorElement?.classList.remove("flash-success");
          }, 300);

          return true; // Handled
        }

        // Handle Command/Ctrl + K for link dialog
        if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          event.stopPropagation();

          // Get selected text to pre-fill link text
          const { from, to } = view.state.selection;
          const selectedText = view.state.doc.textBetween(from, to);
          if (selectedText) {
            setLinkText(selectedText);
          }

          // Set position for the dialog trigger
          const rect = view.dom.getBoundingClientRect();
          setTriggerPosition({
            x: rect.left + 20,
            y: rect.top - 10,
          });
          setShowLinkDialog(true);

          return true; // Handled
        }

        // Handle Escape key
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();

          if (showLinkDialog) {
            setShowLinkDialog(false);
            setLinkUrl("");
            setLinkText("");
          } else {
            cancelEditing();
          }

          return true; // Handled
        }

        // Handle Tab to navigate to next cell
        if (event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();

          saveAndExit();
          setTimeout(() => {
            onNavigateNext?.();
          }, 100);

          return true; // Handled
        }

        return false; // Not handled, let editor process normally
      },
    },
    onUpdate: () => {
      updateCharCount();
      // Show recent timers if content becomes empty
      if (editor && isEditing) {
        const currentContent = getMarkdownContent();
        if (!currentContent || currentContent.trim() === '') {
          setShowRecentTimers(true);
          setHighlightedIndex(0);
        }
      }
    },
    // Remove onBlur - we handle closing via click outside detection now
  });

  // Handle refocusing when popover closes
  React.useEffect(() => {
    // If popover closes due to no results, refocus the editor ONLY if still in editing mode
    // But don't refocus if we just selected a timer (we want to exit editing mode)
    if (!showRecentTimers && isEditing && editor && !justSelectedTimerRef.current) {
      setTimeout(() => {
        editor.commands.focus();
      }, 0);
    }
    // Reset the flag after a delay to allow the click handler to check it
    if (!showRecentTimers && justSelectedTimerRef.current) {
      setTimeout(() => {
        justSelectedTimerRef.current = false;
      }, 300);
    }
  }, [showRecentTimers, isEditing, editor]);

  React.useEffect(() => {
    // Set the editor ref for markdown conversion
    editorRef.current = editor;

    const currentContent = getMarkdownContent();
    const contentMismatch = description !== currentContent;

    console.log(`[ExpandableDescription] 🔄 useEffect triggered:`, {
      isEditing,
      descriptionProp: description,
      currentEditorContent: currentContent,
      contentMismatch,
      willUpdate: editor && !isEditing && contentMismatch,
    });

    // Don't update editor content if user is actively editing (prevents interrupting typing)
    if (editor && !isEditing && contentMismatch) {
      console.log(`[ExpandableDescription] ⚠️ REPLACING EDITOR CONTENT with:`, description);
      // Convert markdown to HTML before setting content
      editor.commands.setContent(markdownToHtml(description));
      // Update character count after setting content
      setTimeout(() => {
        updateCharCount();
      }, 0);
    }
  }, [
    description,
    editor,
    isEditing,
    getMarkdownContent,
    markdownToHtml,
    updateCharCount,
  ]);

  const handleClick = () => {
    // Don't reopen if we just selected a timer
    if (justSelectedTimerRef.current) {
      return;
    }

    if (!isEditing) {
      setIsEditing(true);
      setCurrentCharCount(description.length);

      // If description is empty, show recent timers popover
      if (!description || description.trim() === '') {
        setShowRecentTimers(true);
        setHighlightedIndex(0);
      }

      // Focus the editor after a short delay to ensure it's rendered
      setTimeout(() => {
        editor?.commands.focus("end");
        updateCharCount();
      }, 100);
    }
  };

  const saveAndExit = async () => {
    if (editor) {
      const currentContent = getMarkdownContent();

      // Only save if content has actually changed
      if (currentContent !== description) {
        onSave?.(currentContent);
      }
      setIsEditing(false);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setCurrentCharCount(description.length);
    // Reset to original content
    editor?.commands.setContent(markdownToHtml(description));
  };

  const handleInsertLink = () => {
    if (!editor || !linkUrl.trim()) return;

    let url = linkUrl.trim();

    // Convert relative URLs to absolute URLs
    if (!url.match(/^https?:\/\//)) {
      url = `https://${url}`;
    }

    const text = linkText.trim() || linkUrl.trim(); // Use original input for display text

    // Get current selection or insert at cursor
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);

    if (selectedText) {
      // Replace selected text with link
      editor
        .chain()
        .focus()
        .deleteSelection()
        .insertContent(`<a href="${url}">${text || selectedText}</a>`)
        .run();
    } else {
      // Insert link at cursor position
      editor
        .chain()
        .focus()
        .insertContent(`<a href="${url}">${text}</a>`)
        .run();
    }

    // Reset dialog state
    setLinkUrl("");
    setLinkText("");
    setShowLinkDialog(false);

    // Focus back to editor
    setTimeout(() => {
      editor.commands.focus();
      updateCharCount();
    }, 100);
  };

  if (!description && !isEditing) {
    return (
      <div
        onClick={handleClick}
        data-testid={dataTestId}
        className="text-muted-foreground italic cursor-pointer p-2 hover:bg-accent/50 rounded-md transition-all duration-200 hover:text-accent-foreground group min-w-0 max-w-full overflow-hidden"
      >
        <span className="group-hover:translate-x-0.5 transition-transform duration-200 inline-block truncate text-ellipsis whitespace-nowrap w-full">
          Click to add description
        </span>
      </div>
    );
  }

  if (isEditing && editor) {
    return (
      <RecentTimersPopover
        open={showRecentTimers}
        onOpenChange={setShowRecentTimers}
        searchQuery={searchQuery}
        projects={projects}
        availableTags={availableTags}
        maxResults={5}
        onSelect={(entry) => {
          justSelectedTimerRef.current = true;
          onRecentTimerSelect?.(entry);
          setShowRecentTimers(false);
          setIsEditing(false);
          // Stay in current cell, don't navigate down
        }}
        highlightedIndex={highlightedIndex}
        onHighlightedIndexChange={setHighlightedIndex}
        onTimersChange={(timers) => {
          recentTimersRef.current = timers;
        }}
      >
        <div className="w-full editor-container" data-testid={dataTestId}>
          <div className="relative">
            <EditorContent
              editor={editor}
              className="w-full"
            />

          {/* Character Counter */}
          <div
            className={`absolute top-2 right-2 text-xs px-2 py-1 rounded-md backdrop-blur-sm pointer-events-none ${
              isOverLimit
                ? "text-red-600 bg-red-50/90 dark:bg-red-900/20 dark:text-red-400"
                : remainingChars < 100
                ? "text-amber-600 bg-amber-50/90 dark:bg-amber-900/20 dark:text-amber-400"
                : "text-muted-foreground bg-background/90"
            }`}
          >
            {remainingChars >= 0 ? remainingChars : remainingChars}
          </div>

          {/* Link Dialog */}
          <Popover open={showLinkDialog} onOpenChange={setShowLinkDialog}>
            <PopoverTrigger asChild>
              <div
                className="absolute pointer-events-none"
                style={{
                  left: triggerPosition.x,
                  top: triggerPosition.y,
                  width: 1,
                  height: 1,
                }}
              />
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" side="top" align="start">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="link-url">URL</Label>
                  <Input
                    id="link-url"
                    placeholder="https://example.com"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleInsertLink();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setShowLinkDialog(false);
                        setLinkUrl("");
                        setLinkText("");
                      }
                    }}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="link-text">Link Text (optional)</Label>
                  <Input
                    id="link-text"
                    placeholder="Link text"
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleInsertLink();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setShowLinkDialog(false);
                        setLinkUrl("");
                        setLinkText("");
                      }
                    }}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleInsertLink}
                    disabled={!linkUrl.trim()}
                  >
                    Insert Link
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowLinkDialog(false);
                      setLinkUrl("");
                      setLinkText("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Press Enter to insert, Esc to cancel
                </div>
              </div>
            </PopoverContent>
          </Popover>
          </div>
        </div>
      </RecentTimersPopover>
    );
  }

  return (
    <div
      onClick={handleClick}
      data-testid={dataTestId}
      className="cursor-pointer hover:bg-accent/30 rounded-md p-2 transition-transform duration-200 hover:scale-[1.01] group active:scale-[0.99] w-full min-w-0 max-w-full overflow-hidden"
    >
      <div className="truncate w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm group-hover:text-accent-foreground transition-colors min-w-0 max-w-full">
        <ReactMarkdown
          components={{
            p: ({ children }) => <span>{children}</span>,
            a: ({ href, children }) => (
              <a
                href={href}
                className="text-blue-500 hover:underline transition-colors"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                {children}
              </a>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold">{children}</strong>
            ),
            em: ({ children }) => <em className="italic">{children}</em>,
          }}
        >
          {description.split("\n")[0]}
        </ReactMarkdown>
      </div>
    </div>
  );
}
