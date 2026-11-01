import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from './read.js';

// Lines per status for one night (not rows). Bad lines are ignored, not counted.
export type StatusCounts = { ok: number; retry: number; fail: number };

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

// null = no file for that night. Same line handling as readNight in read.ts.
export function countStatuses(runsDir: string, night: string): StatusCounts | null {
  if (!NIGHT.test(night)) return null; // guards path traversal, as readNight does

  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (e) {
    if (typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'ENOENT') return null;
    throw e;
  }

  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  for (const raw of text.split('\n')) {
    const lineText = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (lineText.trim() === '') continue;
    const line = parseLine(lineText);
    if (!line) continue;
    counts[line.status]++;
  }
  return counts;
}
