"use client";

import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import * as React from "react";

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
  const [isSaving, setIsSaving] = React.useState(false);

  // Notify parent of editing state changes
  React.useEffect(() => {
    onEditingChange?.(isEditing);
  }, [isEditing, onEditingChange]);

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
    content: description,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[24px] p-3 border border-border/60 rounded-md resize-none leading-tight transition-all duration-200 focus:border-primary/50 focus:ring-2 focus:ring-primary/10",
      },
    },
    onBlur: async () => {
      if (isEditing && editor) {
        const newContent = editor.getText();
        // Only save if content has actually changed
        if (newContent !== description) {
          setIsSaving(true);
          await new Promise((resolve) => setTimeout(resolve, 300)); // Brief delay for smooth animation
          onSave?.(newContent);
          setIsSaving(false);
        }
        setIsEditing(false);
      }
    },
  });

  React.useEffect(() => {
    if (editor && description !== editor.getText()) {
      editor.commands.setContent(description);
    }
  }, [description, editor]);

  const handleClick = () => {
    if (!isEditing) {
      setIsEditing(true);
      // Focus the editor after a short delay to ensure it's rendered
      setTimeout(() => {
        editor?.commands.focus();
      }, 100);
    }
  };

  const saveAndExit = async () => {
    if (editor) {
      const currentContent = editor.getText();

      // Only save if content has actually changed
      if (currentContent !== description) {
        setIsSaving(true);
        onSave?.(currentContent);
        setTimeout(() => setIsSaving(false), 300);
      }
      setIsEditing(false);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    editor?.commands.setContent(description);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isEditing) return;

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelEditing();
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      // Save current content and move to next cell
      saveAndExit();
      setTimeout(() => {
        onNavigateNext?.();
      }, 100); // Small delay to ensure editing state is updated
      return;
    }

    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault(); // Prevent the line break from being added
      e.stopPropagation(); // Stop event propagation

      saveAndExit();

      // Add a subtle flash effect for the keyboard shortcut
      const editorElement = e.currentTarget.closest(".editor-container");
      editorElement?.classList.add("flash-success");
      setTimeout(() => {
        editorElement?.classList.remove("flash-success");
      }, 300);
    }
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
      <div
        className="w-full editor-container"
        onKeyDown={handleKeyDown}
        data-testid={dataTestId}
      >
        <EditorContent
          editor={editor}
          className={`w-full transition-all duration-200 ${
            isSaving ? "opacity-60 scale-[0.99]" : ""
          }`}
        />
        {/* <div className="text-xs text-muted-foreground mt-1">
          Press Cmd/Ctrl+Enter to save, Esc to cancel
        </div> */}
        {isSaving && (
          <div className="text-xs text-primary/70 mt-1 animate-pulse">
            Saving...
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      data-testid={dataTestId}
      className="cursor-pointer hover:bg-accent/30 rounded-md p-2 transition-all duration-200 hover:scale-[1.01] group active:scale-[0.99] w-full min-w-0"
    >
      <div className="truncate w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm group-hover:text-accent-foreground transition-colors min-w-0">
        {description.split("\n")[0]}
      </div>
    </div>
  );
}
