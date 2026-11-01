import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { countStatuses } from '../src/digest/counts.js';

describe('countStatuses on runs/ fixtures', () => {
  it('counts lines per status for 2026-10-28 (bad line ignored)', () => {
    expect(countStatuses('runs', '2026-10-28')).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('counts lines per status for 2026-10-27', () => {
    expect(countStatuses('runs', '2026-10-27')).toEqual({ ok: 7, retry: 0, fail: 0 });
  });

  it('returns null for a night with no file, and for a non-date name', () => {
    expect(countStatuses('runs', '2099-01-01')).toBeNull();
    expect(countStatuses('runs', '../runs/2026-10-28')).toBeNull();
  });
});

describe('countStatuses line handling', () => {
  const dir = mkdtempSync(join(tmpdir(), 'counts-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('handles CRLF, blank lines, bad lines and a missing trailing newline', () => {
    const ok = '{"at":"t","job":"a","status":"ok","owner":null}';
    const fail = '{"at":"t","job":"b","status":"fail","owner":null}';
    writeFileSync(join(dir, '2026-01-02.jsonl'), `${ok}\r\n\r\n${fail}\r\nnot json\n${ok}`);
    expect(countStatuses(dir, '2026-01-02')).toEqual({ ok: 2, retry: 0, fail: 1 });
  });

  it('gives zeros for an empty file', () => {
    writeFileSync(join(dir, '2026-01-03.jsonl'), '');
    expect(countStatuses(dir, '2026-01-03')).toEqual({ ok: 0, retry: 0, fail: 0 });
  });
});
