export const AI_SUMMARY_TAG = "deeplog-ai-summary";
export const AI_SUMMARY_VERSION = "1";

export interface ExtractedAiSummary {
  version: string | null;
  entryId: string | null;
  sourceStart: string | null;
  sourceEnd: string | null;
  generatedAt: string | null;
  content: string;
  raw: string;
}

const AI_SUMMARY_PATTERN =
  /<deeplog-ai-summary\b([^>]*)>([\s\S]*?)<\/deeplog-ai-summary>/gi;
const ATTRIBUTE_PATTERN = /([\w-]+)="([^"]*)"/g;
const ENCRYPTED_DESCRIPTION_PATTERN =
  /^[A-Za-z0-9+/]{16}:[A-Za-z0-9+/]{22}==:[A-Za-z0-9+/]+={0,2}$/;

const escapeAttribute = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const readAttributes = (source: string) => {
  const attributes = new Map<string, string>();
  for (const match of source.matchAll(ATTRIBUTE_PATTERN)) {
    attributes.set(match[1], match[2]);
  }
  return attributes;
};

export const extractAiSummaries = (
  description: string
): ExtractedAiSummary[] =>
  Array.from(description.matchAll(AI_SUMMARY_PATTERN)).map((match) => {
    const attributes = readAttributes(match[1]);
    return {
      version: attributes.get("version") ?? null,
      entryId: attributes.get("entry-id") ?? null,
      sourceStart: attributes.get("source-start") ?? null,
      sourceEnd: attributes.get("source-end") ?? null,
      generatedAt: attributes.get("generated-at") ?? null,
      content: match[2].trim(),
      raw: match[0],
    };
  });

export const removeAiSummaries = (description: string) =>
  description.replace(AI_SUMMARY_PATTERN, "").trim();

export const hasAiSummaryForRange = (
  description: string,
  entryId: number,
  sourceStart: string,
  sourceEnd: string
) =>
  extractAiSummaries(description).some(
    (summary) =>
      summary.version === AI_SUMMARY_VERSION &&
      summary.entryId === entryId.toString() &&
      summary.sourceStart === sourceStart &&
      summary.sourceEnd === sourceEnd
  );

export const buildAiSummaryBlock = ({
  entryId,
  sourceStart,
  sourceEnd,
  generatedAt,
  summary,
}: {
  entryId: number;
  sourceStart: string;
  sourceEnd: string;
  generatedAt: string;
  summary: string;
}) => {
  const safeSummary = summary
    .trim()
    .replaceAll(`</${AI_SUMMARY_TAG}>`, `&lt;/${AI_SUMMARY_TAG}&gt;`);

  return `<${AI_SUMMARY_TAG} version="${AI_SUMMARY_VERSION}" entry-id="${entryId}" source-start="${escapeAttribute(sourceStart)}" source-end="${escapeAttribute(sourceEnd)}" generated-at="${escapeAttribute(generatedAt)}">
${safeSummary}
</${AI_SUMMARY_TAG}>`;
};

export const isEncryptedDescription = (description: string) =>
  ENCRYPTED_DESCRIPTION_PATTERN.test(description.trim());
