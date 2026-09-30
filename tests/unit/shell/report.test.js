import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reportUrl, REPO_URL } from '../../../src/shell/report.js';

test('the report link opens the issue form with page and version filled in (R20)', () => {
  const url = new URL(reportUrl({ page: 'Debrief Viewer', version: '2026-09-30 abc1234' }));
  assert.equal(`${url.origin}${url.pathname}`, `${REPO_URL}/issues/new`);
  assert.equal(url.searchParams.get('template'), 'problem.yml');
  assert.equal(url.searchParams.get('page'), 'Debrief Viewer');
  assert.equal(url.searchParams.get('version'), '2026-09-30 abc1234');
  assert.equal(url.searchParams.get('title'), 'Problem: Debrief Viewer');
});

test('the prefilled fields exist in the issue form', () => {
  const form = readFileSync(new URL('../../../.github/ISSUE_TEMPLATE/problem.yml', import.meta.url), 'utf8');
  for (const id of ['page', 'version']) assert.match(form, new RegExp(`id: ${id}\\b`));
});
