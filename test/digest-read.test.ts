import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('gives 5 rows sorted by job and 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night!.night).toBe('2026-10-28');
    expect(night!.badLines).toBe(1);
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('aggregates each job', () => {
    const [render, refresh, sync, backup, rotate] = night!.rows;
    expect(render).toMatchObject({ owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null });
    expect(refresh).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      first: '2026-10-29T01:30:00+01:00',
      last: '2026-10-29T01:37:00+01:00',
    });
    // The truncated `lane/sy…` line is bad and not counted for lane/sync.
    expect(sync).toEqual({
      job: 'lane/sync',
      owner: 'rook',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      first: '2026-10-28T23:00:06+01:00',
      last: '2026-10-29T05:00:04+01:00',
    });
    expect(backup).toMatchObject({ owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(rotate).toMatchObject({ owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'ok', lastError: null });
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null for a missing file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns an empty night for an empty file', () => {
    writeFileSync(join(dir, '2026-01-02.jsonl'), '');
    expect(readNight(dir, '2026-01-02')).toEqual({ night: '2026-01-02', rows: [], badLines: 0 });
  });

  it('handles CRLF lines, blank lines and wrong-shaped lines', () => {
    const lines = [
      '{"at":"2026-01-03T23:00:00+01:00","job":"a","status":"retry","owner":"x","error":"boom"}',
      '',
      '{"at":"2026-01-04T00:00:00+01:00","job":"a","status":"ok","owner":null}',
      '{"at":"2026-01-04T00:00:00+01:00","job":"a","status":"weird","owner":"x"}',
      '[1,2]',
    ];
    writeFileSync(join(dir, '2026-01-03.jsonl'), lines.join('\r\n') + '\r\n');
    expect(readNight(dir, '2026-01-03')).toEqual({
      night: '2026-01-03',
      badLines: 2,
      rows: [
        {
          job: 'a',
          owner: null,
          runs: 2,
          retries: 1,
          lastStatus: 'ok',
          lastError: 'boom',
          first: '2026-01-03T23:00:00+01:00',
          last: '2026-01-04T00:00:00+01:00',
        },
      ],
    });
  });

  it('returns null for an invalid night string', () => {
    writeFileSync(join(dir, 'x.jsonl'), '');
    expect(readNight(dir, '../x')).toBeNull();
    expect(readNight(dir, 'x')).toBeNull();
    expect(readNight(dir, '2026-1-1')).toBeNull();
  });
});
