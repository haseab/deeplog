import MarkdownIt from "markdown-it";
import TurndownService from "turndown";

const MARKDOWN_ESCAPE_REGEX = /\\([\\`*_[\]{}()#+\-.!])/g;

const markdownParser = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: false,
});

function decodeMarkdownEscapes(text: string): string {
  let decoded = text;
  let previous = "";

  while (decoded !== previous) {
    previous = decoded;
    decoded = decoded.replace(MARKDOWN_ESCAPE_REGEX, "$1");
  }

  return decoded;
}

// Markdown discards empty paragraphs. A non-breaking-space entity gives each
// blank editor line a standard Markdown representation that survives storage.
const turndownService = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  blankReplacement: (_content, node) => {
    if (node.nodeName === "P") return "\n\n&nbsp;\n\n";
    return (node as Node & { isBlock?: boolean }).isBlock ? "\n\n" : "";
  },
});

// Explicit breaks plus a spacer also preserve consecutive and trailing breaks.
// Markdown otherwise trims trailing breaks and folds blank lines into paragraphs.
turndownService.addRule("hardBreaks", {
  filter: "br",
  replacement: () => "\\\n&nbsp;",
});

turndownService.addRule("links", {
  filter: "a",
  replacement: (content, node) => {
    const href = (node as HTMLAnchorElement).getAttribute("href") || "";
    const title = (node as HTMLAnchorElement).getAttribute("title");
    return title
      ? `[${content}](${href} "${title}")`
      : `[${content}](${href})`;
  },
});

export function descriptionHtmlToMarkdown(html: string): string {
  // Keep a completely cleared description empty rather than saving a spacer.
  if (/^(?:<p>(?:<br\s*\/?>)?<\/p>)?$/.test(html)) return "";
  return decodeMarkdownEscapes(turndownService.turndown(html));
}

export function descriptionMarkdownToHtml(markdown: string): string {
  if (!markdown) return "";
  // Restore actual empty paragraphs so editing never accumulates spacer text.
  return markdownParser.render(markdown)
    .replace(/<br>\n\u00a0/g, "<br>\n")
    .replace(/<p>\u00a0<\/p>/g, "<p></p>");
}
