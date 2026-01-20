import { splitToLines } from "./splitter";
import { MAX_CHARS } from "./rules";

export interface Subtitle {
  index: number;
  time: string;
  text: string[];
  wasSplit?: boolean;
}

/* time helpers */

function timeToMs(t: string): number {
  const [h, m, rest] = t.split(":");
  const [s, ms] = rest.split(",");
  return +h * 3600000 + +m * 60000 + +s * 1000 + +ms;
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
  const step = Math.max(1, Math.floor((e - s) / parts));

  return Array.from({ length: parts }, (_, i) => {
    const a = s + i * step;
    const b = i === parts - 1 ? e : a + step;
    return `${msToTime(a)} --> ${msToTime(b)}`;
  });
}

/* core */

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

/* helper to compute visible length (keeps srt independent of splitter internals) */
function visibleLengthLocal(s: string): number {
  return s.replace(/(\{[^}]*\}|<[^>]+>)/g, "").length;
}

/* event splitter */

function splitIntoEvents(
  text: string,
  time: string,
  startIndex: number
): Subtitle[] {
  const lines = splitToLines(text);

  const hasIllegalLine = lines.some((l) => visibleLengthLocal(l) > MAX_CHARS);

  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += 2) {
    chunks.push(lines.slice(i, i + 2));
  }

  if (chunks.length === 1 && !hasIllegalLine) {
    return [
      {
        index: startIndex,
        time,
        text: chunks[0],
        wasSplit: false,
      },
    ];
  }

  const [start, end] = time.split(" --> ");
  const times = splitTime(start, end, chunks.length);

  return chunks.map((chunk, i) => ({
    index: startIndex + i,
    time: times[i],
    text: chunk,
    wasSplit: true,
  }));
}

/* public fixer */

export function fixSubtitles(subs: Subtitle[]): Subtitle[] {
  const out: Subtitle[] = [];
  let idx = 1;

  for (const sub of subs) {
    const fullText = sub.text.join(" ").replace(/\s+/g, " ").trim();
    const events = splitIntoEvents(fullText, sub.time, idx);

    for (const e of events) {
      out.push({ ...e, index: idx++ });
    }
  }

  return out;
}

export function buildSRT(subs: Subtitle[]): string {
  return subs
    .map((s) => `${s.index}\n${s.time}\n${s.text.join("\n")}`)
    .join("\n\n");
}
