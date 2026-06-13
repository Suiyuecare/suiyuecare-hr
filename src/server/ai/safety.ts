import type { AiPromptCategory } from "./types";

const blockedDecisionPattern =
  /(hire|hiring|reject candidate|fire|firing|terminate|layoff|compensation|salary decision|raise|bonus decision|performance score|performance rating|disciplinary|discipline|裁員|解僱|資遣|錄用|拒絕錄用|薪資決策|調薪|獎金決策|績效評分|懲戒)/i;

export function assertSafeAiUse(input: {
  category: AiPromptCategory;
  prompt: string;
}) {
  if (blockedDecisionPattern.test(input.prompt)) {
    throw new Error(
      "AI cannot make hiring, firing, compensation, performance, or disciplinary decisions. Use a human-only workflow.",
    );
  }
}

export function stripUnnecessaryPii(value: string) {
  return value
    .replace(/[A-Z][0-9]{9}/g, "[REDACTED_NATIONAL_ID]")
    .replace(/\b\d{10,16}\b/g, "[REDACTED_NUMBER]")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[REDACTED_EMAIL]");
}
