export const MAX_CHARS = 42;

export function isForbiddenSplit(prev: string, next: string): boolean {
  if (!prev || !next) return false;

  // article + noun
  if (prev.length <= 3 && next.length > 3) return true;

  // subject pronoun + verb
  if (["i", "you", "he", "she", "we", "they"].includes(prev.toLowerCase()))
    return true;

  // auxiliary / negation
  if (prev.endsWith("n't") || prev.endsWith("'t")) return true;

  // phrasal verb hint
  if (
    ["give", "take", "put", "get"].includes(prev.toLowerCase()) &&
    next.length <= 3
  )
    return true;

  // proper names
  if (
    prev[0] === prev[0]?.toUpperCase() &&
    next[0] === next[0]?.toUpperCase()
  )
    return true;

  return false;
}
