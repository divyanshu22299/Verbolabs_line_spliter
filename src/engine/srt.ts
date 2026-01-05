import { splitByMeaning } from "./splitter";

export interface Subtitle {
  index: number;
  time: string;
  text: string[];
   wasSplit?: boolean; // 🟣 added
}

/* ───────── time helpers ───────── */

function timeToMs(t: string): number {
  const [h, m, rest] = t.split(":");
  const [s, ms] = rest.split(",");
  return (
    +h * 3600000 +
    +m * 60000 +
    +s * 1000 +
    +ms
  );
}

function msToTime(ms: number): string {
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  ms %= 3600000;
  const m = String(Math.floor(ms / 60000)).padStart(2, "0");
  ms %= 60000;
  const s = String(Math.floor(ms / 1000)).padStart(2, "0");
  const msr = String(ms % 1000).padStart(3, "0");
  return `${h}:${m}:${s},${msr}`;
}

function splitTime(start: string, end: string, parts: number): string[] {
  const s = timeToMs(start);
  const e = timeToMs(end);
  const step = Math.floor((e - s) / parts);

  return Array.from({ length: parts }, (_, i) => {
    const a = s + i * step;
    const b = i === parts - 1 ? e : a + step;
    return `${msToTime(a)} --> ${msToTime(b)}`;
  });
}

/* ───────── core ───────── */

export function parseSRT(input: string): Subtitle[] {
  return input
    .trim()
    .split(/\n\s*\n/)
    .map((block, i) => {
      const lines = block.split("\n");
      return {
        index: Number(lines[0]) || i + 1,
        time: lines[1],
        text: lines.slice(2),
      };
    });
}

export function fixSubtitles(subs: Subtitle[]): Subtitle[] {
  const out: Subtitle[] = [];
  let idx = subs[0]?.index || 1;

  for (const sub of subs) {
    const fullText = sub.text.join(" ").replace(/\s+/g, " ").trim();

    // 🚫 HARD RULE: one-line subtitles > 42 chars are NOT allowed
    const mustSplit = fullText.length > 42;

    // Try 2-line reflow
    const lines = splitByMeaning(fullText);

    // ✅ Accept ONLY valid 2-line subtitles
    if (
      lines.length === 2 &&
      lines.every((l) => l.length <= 42)
    ) {
      out.push({
        index: idx++,
        time: sub.time,
        text: lines,
      });
      continue;
    }

    // ❗ If forced split or impossible 2-line → SPLIT EVENT
    if (mustSplit) {
      const sentences = fullText.split(/(?<=[.!?])\s+/);

      if (sentences.length > 1) {
        const [start, end] = sub.time.split(" --> ");
        const times = splitTime(start, end, sentences.length);

        sentences.forEach((sentence, i) => {
          out.push({
            index: idx++,
            time: times[i],
            text: splitByMeaning(sentence),
          });
        });
        continue;
      }
    }

    // 🔒 LAST RESORT (should never violate 42)
    out.push({
      index: idx++,
      time: sub.time,
      text: splitByMeaning(fullText),
    });
  }

  return out;
}

export function buildSRT(subs: Subtitle[]): string {
  return subs
    .map(
      (s) =>
        `${s.index}\n${s.time}\n${s.text.join("\n")}`
    )
    .join("\n\n");
}
    