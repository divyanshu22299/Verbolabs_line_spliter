import { MAX_CHARS, isForbiddenSplit, calculateSplitQuality } from "./rules";

/*
  We treat formatting tags as invisible for counting:
    {\an8} <i> </i> <b> </b> <u> </u> <font ...> </font>
*/
const TAG_REGEX = /(\{[^}]*\}|<[^>]+>)/g;

const BAD_END_WORDS = new Set([
  "and","or","but","so","to","of","in","on","at","with","for",
  "this","that","it","is","was","were","be","been","being"
]);

const CONJ = new Set(["and", "but", "or", "so", "because", "however"]);
const PREP = new Set([
  "to","in","on","at","with","for","from","into","onto","over","under","about","after","before","by","around","through"
]);

/* ───────── helpers ───────── */

export function splitIntoSemanticChunks(text: string): string[] {
  // 1. Strong sentence boundaries only
  const hard = text.split(/(?<=[.!?;])/);
  if (hard.length > 1) {
    return hard.map(s => s.trim()).filter(Boolean);
  }

  // 2. Clause boundaries via conjunctions (NOT commas)
  const parts = text.split(/\b(and|but|or|so|because|however|although|though|while|when|if)\b/i);
  if (parts.length > 1) {
    const out: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]?.trim();
      if (!p) continue;

      // attach conjunction to the following clause
      if (/^(and|but|or|so|because|however|although|though|while|when|if)$/i.test(p) && i + 1 < parts.length) {
        const next = parts[i + 1]?.trim();
        if (next) {
          out.push((p + " " + next).trim());
        }
        i++; // skip next
      } else {
        out.push(p);
      }
    }
    return out.filter(Boolean);
  }

  // 3. Otherwise, do NOT split
  return [text];
}


function visibleText(s: string): string {
  return s.replace(TAG_REGEX, "");
}

function visibleLength(s: string): number {
  return visibleText(s).length;
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/* ───────── tokenize (words + tags) ───────── */

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let buffer = "";
  let i = 0;

  while (i < text.length) {
    if (text[i] === "<" || text[i] === "{") {
      if (buffer.trim()) tokens.push(buffer.trim());
      buffer = "";

      const close = text[i] === "<" ? ">" : "}";
      let j = i;
      while (j < text.length && text[j] !== close) j++;
      j++;
      tokens.push(text.slice(i, j));
      i = j;
    } else if (/\s/.test(text[i])) {
      if (buffer) {
        tokens.push(buffer);
        buffer = "";
      }
      i++;
    } else {
      buffer += text[i];
      i++;
    }
  }

  if (buffer) tokens.push(buffer);

  // ensure tags remain intact and words are preserved
  return tokens.filter(Boolean);
}

/* ───────── join tokens preserving tags and spacing ───────── */

function joinTokens(tokens: string[]): string {
  // join with single spaces, but keep tags as tokens (they don't count toward visible length)
  return tokens.join(" ").replace(/\s+/g, " ").trim();
}

/* ───────── bad split detection ───────── */

function isBadSplit(left: string, right: string): boolean {
  const leftClean = visibleText(left).trim();
  const rightClean = visibleText(right).trim();

  if (!leftClean || !rightClean) return true;

  // Too small second line
  if (rightClean.length < 10) return true;
  if (wordCount(rightClean) < 2) return true;

  // Bad ending word on first line
  const lastWord = leftClean.split(/\s+/).pop()?.toLowerCase();
  if (lastWord && BAD_END_WORDS.has(lastWord)) return true;

  return false;
}

/* ───────── per-chunk split helpers ───────── */

/**
 * Find best token index to split tokens into [0..idx-1] and [idx..end].
 * Returns tokenIndex (index in tokens array where right starts), or -1 if none found.
 */
function findBestSplitTokenIndex(tokens: string[]): number {
  // Build token -> cumulative words before token
  const tokenWordIndex: number[] = [];
  let runningWords = 0;
  for (const tok of tokens) {
    tokenWordIndex.push(runningWords);
    if (!tok.startsWith("<") && !tok.startsWith("{")) runningWords++;
  }
  const totalWords = runningWords;

  if (totalWords < 2) return -1;

  const candidates: { tokenSplitIdx: number; score: number; left: string; right: string }[] = [];

  for (let k = 1; k < totalWords; k++) {
    const tokenSplitIdx = tokenWordIndex.findIndex((v) => v === k);
    if (tokenSplitIdx === -1) continue;

    const leftTokens = tokens.slice(0, tokenSplitIdx);
    const rightTokens = tokens.slice(tokenSplitIdx);

    const left = joinTokens(leftTokens);
    const right = joinTokens(rightTokens);

    if (!left || !right) continue;
    if (visibleLength(left) > MAX_CHARS) continue; // left must fit
    // right may be longer (we'll split it further), but avoid trivial tiny rights
    if (visibleLength(right) < 3) continue;

    if (isBadSplit(left, right)) continue;

    const lastLeftWord = visibleText(left).trim().split(/\s+/).pop() || "";
    const firstRightWord = visibleText(right).trim().split(/\s+/)[0] || "";

    let score = 0;

    // strong bonuses/penalties
    if (/[.!?;:,]$/.test(lastLeftWord)) score += 30;
    if (CONJ.has(firstRightWord.toLowerCase())) score += 20;
    if (PREP.has(firstRightWord.toLowerCase())) score += 15;

    // prefer semantic boundaries (we can detect short chunks around punctuation by inspecting tokens)
    // simple heuristic: if left ends with punctuation token or comma, add bonus
    if (/[,.!?;:]$/.test(lastLeftWord)) score += 10;

    // rule-based quality
    score += calculateSplitQuality(lastLeftWord, firstRightWord);

    // forbidden split penalty
    if (isForbiddenSplit(lastLeftWord, firstRightWord)) score -= 200;

    // small balance bonus: favor left not too short
    const leftLen = visibleLength(left);
    const rightLen = visibleLength(right);
    const diff = Math.abs(leftLen - rightLen);
    if (diff < 6) score += 5;
    else if (diff < 12) score += 2;

    candidates.push({ tokenSplitIdx, score, left, right });
  }

  if (candidates.length === 0) return -1;

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  // safety: require best score to be reasonable
  if (best.score < -50) return -1;

  return best.tokenSplitIdx;
}

/**
 * Greedy fallback split: accumulate tokens until exceed MAX_CHARS and split before the last token.
 * Returns token index where right starts. Guarantees left fits.
 */
function greedySplitTokenIndex(tokens: string[]): number {
  let currentTokens: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const test = currentTokens.length ? joinTokens([...currentTokens, tok]) : joinTokens([tok]);
    if (visibleLength(test) > MAX_CHARS) {
      if (currentTokens.length === 0) {
        // single token exceeds MAX_CHARS (rare — long word). Force split after this token.
        return i + 1;
      }
      return i;
    } else {
      currentTokens.push(tok);
    }
  }
  // all fit (shouldn't reach here because caller checks length), return -1
  return -1;
}

/* ───────── split a single semantic chunk into multiple wrapped lines ───────── */

function splitChunkIntoLines(chunk: string): string[] {
  const out: string[] = [];
  let tokens = tokenize(chunk);

  // fast-path: if whole chunk fits, return it as a single line
  if (visibleLength(joinTokens(tokens)) <= MAX_CHARS) {
    return [joinTokens(tokens)];
  }

  // repeatedly split off the leftmost line until everything fits into lines
  while (tokens.length > 0) {
    const remainingText = joinTokens(tokens);
    if (visibleLength(remainingText) <= MAX_CHARS) {
      out.push(remainingText);
      break;
    }

    // try to find a good split index
    let splitIdx = findBestSplitTokenIndex(tokens);

    if (splitIdx === -1) {
      // fallback greedy
      splitIdx = greedySplitTokenIndex(tokens);
    }

    // If still -1 (weird), break as one line to avoid infinite loop
    if (splitIdx <= 0 || splitIdx >= tokens.length) {
      // push remaining as last resort (shouldn't happen often)
      // but ensure we don't create empty strings
      const last = joinTokens(tokens).trim();
      if (last) out.push(last);
      break;
    }

    const left = joinTokens(tokens.slice(0, splitIdx)).trim();
    if (left) out.push(left);
    tokens = tokens.slice(splitIdx);
  }

  return out;
}

/* ───────── main splitter ───────── */

export function splitToLines(text: string): string[] {
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return [];

  // If whole text fits, quick return
  if (visibleLength(text) <= MAX_CHARS) return [text];

  // Semantic-first: split into coarse chunks (clauses)
  const semanticChunks = splitIntoSemanticChunks(text);

  const finalLines: string[] = [];

  for (const chunk of semanticChunks) {
    const chunkText = chunk.trim();
    if (!chunkText) continue;

    // if chunk is short, prefer to keep as one line unless it's slightly over
    if (visibleLength(chunkText) <= MAX_CHARS) {
      finalLines.push(chunkText);
      continue;
    }

    // otherwise split chunk into multiple lines
    const lines = splitChunkIntoLines(chunkText);
    for (const l of lines) {
      if (l) finalLines.push(l);
    }
  }

  // Safety: ensure no line exceeds MAX_CHARS (final guard)
  const guarded: string[] = [];
  for (const line of finalLines) {
    if (visibleLength(line) <= MAX_CHARS) {
      guarded.push(line);
      continue;
    }
    // final fallback: hard wrap by characters (rare)
    let rem = line;
    while (visibleLength(rem) > MAX_CHARS) {
      // try to cut at last space within limit
      let cutPos = -1;
      let acc = "";
      const toks = tokenize(rem);
      let i = 0;
      for (; i < toks.length; i++) {
        const ttest = joinTokens(toks.slice(0, i + 1));
        if (visibleLength(ttest) <= MAX_CHARS) {
          cutPos = i + 1;
        } else break;
      }
      if (cutPos <= 0) {
        // no token fits; force split by characters
        const visible = visibleText(rem);
        const take = visible.slice(0, MAX_CHARS);
        guarded.push(take);
        rem = rem.slice(take.length);
      } else {
        guarded.push(joinTokens(toks.slice(0, cutPos)));
        rem = joinTokens(toks.slice(cutPos));
      }
    }
    if (rem.trim()) guarded.push(rem.trim());
  }

  return guarded;
}
