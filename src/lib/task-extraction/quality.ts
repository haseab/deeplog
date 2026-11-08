import type { Transcript, Version } from "./ledger";

export const ENUMERATION_MODEL = "gpt-6-luna";
export const REVIEW_MODEL = "gpt-6.1-sol";

export interface QualityDecision {
  candidate: number;
  keep: boolean;
  reason: string;
  evidence: string;
}
export interface QualityReview {
  model: typeof REVIEW_MODEL;
  completedAt: string;
  decisions: QualityDecision[];
}
export interface ReviewInput {
  text: string;
  candidates: string[];
}

export function transcriptText(transcript: Transcript) {
  return (transcript.contents ?? [])
    .filter(segment => segment.type === "blockquote" && segment.content?.trim())
    .map(segment => `[${segment.startTime || transcript.startTime}] ${segment.content!.trim()}`)
    .join("\n");
}

export const normalizeTask = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");

export function enumeratedCandidates(version: Pick<Version, "chunks">) {
  const seen = new Set<string>();
  return version.chunks.flatMap(chunk => chunk.tasks ?? []).map(task => task.trim()).filter(task => {
    const key = normalizeTask(task);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// A review selects existing candidates; it cannot introduce new tasks. Every
// candidate needs a decision, and every kept task needs a real source quote.
export function validateQualityDecisions(value: unknown, input: ReviewInput): asserts value is QualityDecision[] {
  if (!Array.isArray(value) || value.length !== input.candidates.length) throw new Error("Quality review must decide every candidate");
  const seen = new Set<number>();
  const source = input.text.replace(/\s+/g, " ");
  for (const decision of value) {
    if (!decision || !Number.isInteger(decision.candidate) || decision.candidate < 0 || decision.candidate >= input.candidates.length ||
      seen.has(decision.candidate) || typeof decision.keep !== "boolean" || typeof decision.reason !== "string" || !decision.reason.trim() ||
      typeof decision.evidence !== "string" || (decision.keep && (!decision.evidence.trim() || !source.includes(decision.evidence.trim().replace(/\s+/g, " "))))) {
      throw new Error("Invalid quality review decision or unsupported source evidence");
    }
    seen.add(decision.candidate);
  }
}

export function approvedTasks(version: Version) {
  const candidates = enumeratedCandidates(version);
  const kept = new Set(version.qualityReview?.decisions.filter(decision => decision.keep).map(decision => decision.candidate));
  return candidates.filter((_candidate, index) => kept.has(index));
}

export function hasUnfinishedAnalysis(version: Version) {
  return version.chunks.length > 0 && (!version.qualityReview || version.chunks.some(chunk => chunk.tasks === undefined));
}
