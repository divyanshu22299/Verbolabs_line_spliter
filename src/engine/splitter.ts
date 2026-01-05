import { MAX_CHARS, isForbiddenSplit } from "./rules";

const BAD_LINE_END_WORDS = ["and", "but", "or", "so"];

function isMeaningfulSplit(left: string, right: string): boolean {
  const leftWords = left.trim().split(/\s+/);
  const rightWords = right.trim().split(/\s+/);

  // ❌ hard 42-char rule
  if (left.length > MAX_CHARS || right.length > MAX_CHARS) return false;

  // ❌ avoid very short lines (1 word)
  if (leftWords.length < 2 || rightWords.length < 2) return false;

  // ❌ dangling conjunction at end of line 1
  const lastLeftWord = leftWords[leftWords.length - 1].toLowerCase();
  if (BAD_LINE_END_WORDS.includes(lastLeftWord)) return false;

  // ❌ forbidden semantic split
  const firstRightWord = rightWords[0];
  if (isForbiddenSplit(lastLeftWord, firstRightWord)) return false;

  return true;
}

/**
 * Higher score = better split
 * We prefer balanced lines (bottom-heavy pyramid)
 */
function balanceScore(left: string, right: string): number {
  return right.length - left.length;
}

export function splitByMeaning(text: string): string[] {
  text = text.replace(/\s+/g, " ").trim();

  // ✅ keep single line if it fits
  if (text.length <= MAX_CHARS) return [text];

  const words = text.split(" ");
  let bestIndex = -1;
  let bestScore = -Infinity;

  // 🔍 find best meaningful split
  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(" ");
    const right = words.slice(i).join(" ");

    if (!isMeaningfulSplit(left, right)) continue;

    const score = balanceScore(left, right);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  // ✅ best semantic + balanced split
  if (bestIndex !== -1) {
    return [
      words.slice(0, bestIndex).join(" "),
      words.slice(bestIndex).join(" "),
    ];
  }

  // 🔒 last-resort safe word-boundary split (still respects 42)
  for (let i = words.length - 1; i > 0; i--) {
    const left = words.slice(0, i).join(" ");
    const right = words.slice(i).join(" ");

    if (left.length <= MAX_CHARS && right.length <= MAX_CHARS) {
      return [left, right];
    }
  }

  // 🚨 ABSOLUTE FALLBACK — WORD SAFE ONLY (NEVER char slicing)
  const fallback: string[] = [];
  let current = "";

  for (const word of words) {
    if ((current + " " + word).trim().length <= MAX_CHARS) {
      current = (current + " " + word).trim();
    } else {
      fallback.push(current);
      current = word;
    }
  }

  if (current) fallback.push(current);

  return fallback;
}
