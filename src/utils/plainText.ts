import { splitByMeaning } from "../engine/splitter";

export function splitPlainText(line: string): string[] {
  return splitByMeaning(line);
}
