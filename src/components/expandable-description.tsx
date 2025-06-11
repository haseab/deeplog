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

interface ExpandableDescriptionProps {
  description: string;
  onSave?: (newDescription: string) => void;
  onEditingChange?: (isEditing: boolean) => void;
  onNavigateNext?: () => void;
  "data-testid"?: string;
}

export function ExpandableDescription({
  description,
  onSave,
  onEditingChange,
  onNavigateNext,
  "data-testid": dataTestId,
}: ExpandableDescriptionProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [showLinkDialog, setShowLinkDialog] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState("");
  const [linkText, setLinkText] = React.useState("");
  const [triggerPosition, setTriggerPosition] = React.useState({ x: 0, y: 0 });

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

  // Notify parent of editing state changes
  React.useEffect(() => {
    onEditingChange?.(isEditing);
  }, [isEditing, onEditingChange]);

  // Create a ref for the editor to avoid dependency issues
  const editorRef = React.useRef<Editor>(null);

  const getMarkdownContent = React.useCallback(() => {
    if (!editorRef.current) return "";
    const html = editorRef.current.getHTML();
    return turndownService.turndown(html);
  }, [turndownService]);

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
        class:
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[24px] p-3 border border-border/60 rounded-md resize-none leading-tight transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/10",
      },
      handleKeyDown: (view, event) => {
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
    onBlur: async () => {
      if (isEditing && editorRef.current && !showLinkDialog) {
        const newContent = getMarkdownContent();
        // Only save if content has actually changed
        if (newContent !== description) {
          onSave?.(newContent);
        }
        setIsEditing(false);
      }
    },
  });

  React.useEffect(() => {
    // Set the editor ref for markdown conversion
    editorRef.current = editor;

    if (editor && description !== getMarkdownContent()) {
      // Convert markdown to HTML before setting content
      editor.commands.setContent(markdownToHtml(description));
    }
  }, [description, editor, getMarkdownContent, markdownToHtml]);

  const handleClick = () => {
    if (!isEditing) {
      setIsEditing(true);
      // Focus the editor after a short delay to ensure it's rendered
      setTimeout(() => {
        editor?.commands.focus("end");
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
    }, 100);
  };

  if (!description && !isEditing) {
    return (
      <div
        onClick={handleClick}
        data-testid={dataTestId}
        className="text-muted-foreground italic cursor-pointer p-2 hover:bg-accent/50 rounded-md transition-all duration-200 hover:text-accent-foreground group"
      >
        <span className="group-hover:translate-x-0.5 transition-transform duration-200 inline-block">
          Click to add description
        </span>
      </div>
    );
  }

  if (isEditing && editor) {
    return (
      <div className="w-full editor-container" data-testid={dataTestId}>
        <div className="relative">
          <EditorContent editor={editor} className="w-full" />

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
    );
  }

  return (
    <div
      onClick={handleClick}
      data-testid={dataTestId}
      className="cursor-pointer hover:bg-accent/30 rounded-md p-2 transition-transform duration-200 hover:scale-[1.01] group active:scale-[0.99] w-full min-w-0"
    >
      <div className="truncate w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm group-hover:text-accent-foreground transition-colors min-w-0">
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
