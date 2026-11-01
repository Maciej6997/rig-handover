// Plan morning-digest § 1. Shared shapes for the run log reader and every § 2 part.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times keep the log's offset; never converted to UTC.
export type DigestRow = {
  job: string;
  owner: string | null; // view shows `—`
  runs: number; // parsed lines for this job
  retries: number; // lines with status `retry`
  lastStatus: RunStatus;
  lastError: string | null; // last error seen for the job
  first: string;
  last: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job; empty file = []
  badLines: number; // lines that didn't parse, counted, never thrown
};

// null = no file for that night (404); an empty file is a Night with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
