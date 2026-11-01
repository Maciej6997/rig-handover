import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

let dir: string;
const line = (o: object) => JSON.stringify(o);

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  const at = (t: string) => `2026-10-28T${t}+01:00`;
  writeFileSync(
    join(dir, '2026-10-28.jsonl'),
    [
      line({ at: at('01:00:00'), job: 'zeta-sync', status: 'ok', owner: 'ala' }),
      line({ at: at('01:10:00'), job: 'alpha-load', status: 'retry', owner: null, error: 'timeout' }),
      line({ at: at('01:20:00'), job: 'alpha-load', status: 'retry', owner: null, error: 'timeout' }),
      line({ at: at('01:30:00'), job: 'alpha-load', status: 'retry', owner: null, error: 'timeout' }),
      line({ at: at('01:40:00'), job: 'alpha-load', status: 'ok', owner: null }),
      line({ at: at('02:00:00'), job: 'mid-report', status: 'fail', owner: 'bob', error: 'boom' }),
      '',
    ].join('\n'),
  );
  writeFileSync(join(dir, '2026-10-27.jsonl'), '');
  writeFileSync(
    join(dir, '2026-10-26.jsonl'),
    [
      line({ at: '2026-10-26T01:00:00+01:00', job: 'good-job', status: 'ok', owner: 'ala' }),
      'this is not json',
    ].join('\n') + '\n',
  );
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

// status.test.tsx sets LANE_MARKER globally; pin it so results don't depend on test order.
beforeEach(() => {
  process.env.LANE_MARKER = 'ROUTES-TEST';
});

const app = () =>
  createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });

describe('digest page', () => {
  it('200 with job names, — for null owner, warn for retries >= 3 and fail', async () => {
    const res = await app().request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of ['alpha-load', 'mid-report', 'zeta-sync']) expect(html).toContain(job);
    expect(html).toMatch(/<td>alpha-load<\/td><td>—<\/td>/);
    expect(html).toMatch(/<tr class="warn"><td>alpha-load</); // 3 retries
    expect(html).toMatch(/<tr class="warn"><td>mid-report</); // last status fail
    expect(html).not.toMatch(/<tr class="warn"><td>zeta-sync</);
  });

  it('404 for a night with no file and for an invalid night', async () => {
    expect((await app().request('/digest/2026-10-01')).status).toBe(404);
    expect((await app().request('/digest/not-a-date')).status).toBe(404);
  });

  it('empty night says nothing ran', async () => {
    const res = await app().request('/digest/2026-10-27');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).toContain('bad lines: 0');
  });

  it('shows the bad line count', async () => {
    const html = await (await app().request('/digest/2026-10-26')).text();
    expect(html).toContain('bad lines: 1');
    expect(html).toContain('good-job');
  });
});

describe('digest JSON', () => {
  it('200 with rows sorted by job, null owner kept as null', async () => {
    const res = await app().request('/api/digest/2026-10-28');
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-10-28');
    expect(body.rows.map((r) => r.job)).toEqual(['alpha-load', 'mid-report', 'zeta-sync']);
    expect(body.rows[0]?.owner).toBeNull();
    expect(body.rows[0]?.retries).toBe(3);
    expect(body.rows[1]?.lastStatus).toBe('fail');
  });

  it('404 for a night with no file and for an invalid night', async () => {
    expect((await app().request('/api/digest/2026-10-01')).status).toBe(404);
    expect((await app().request('/api/digest/not-a-date')).status).toBe(404);
  });

  it('empty night has rows [] and badLines 0', async () => {
    const res = await app().request('/api/digest/2026-10-27');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-10-27', rows: [], badLines: 0 });
  });

  it('counts the bad line without attributing it to a job', async () => {
    const body = (await (await app().request('/api/digest/2026-10-26')).json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]?.job).toBe('good-job');
    expect(body.rows[0]?.runs).toBe(1);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    for (const night of ['2026-10-28', '2026-10-26']) {
      const html = await (await app().request(`/digest/${night}`)).text();
      const body = (await (await app().request(`/api/digest/${night}`)).json()) as Night;
      const pageJobs = [...html.matchAll(/<tr[^>]*><td>([^<]*)<\/td>/g)].map((m) => m[1]);
      expect(pageJobs).toEqual(body.rows.map((r) => r.job));
      expect(pageJobs.length).toBeGreaterThan(0);
    }
  });
});
