import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const smokeWorkflow = readFileSync('.github/workflows/post-merge-smoke.yml', 'utf8');
const releaseWorkflow = readFileSync('.github/workflows/release.yml', 'utf8');

test('post-merge production smoke gates GitHub Release publication', () => {
  assert.match(smokeWorkflow, /name: post-merge-smoke/);
  assert.match(smokeWorkflow, /workflows:\s*\n\s*- check/);
  assert.match(smokeWorkflow, /workflow_run\.conclusion == 'success'/);
  assert.match(smokeWorkflow, /workflow_run\.head_branch == 'main'/);
  assert.match(smokeWorkflow, /up -d --build --wait --wait-timeout 180/);
  assert.match(smokeWorkflow, /127\.0\.0\.1:18080\/readyz/);
  assert.match(smokeWorkflow, /admin-player-apply-e2e\.spec\.js/);

  assert.match(releaseWorkflow, /workflows:\s*\n\s*- post-merge-smoke/);
  assert.doesNotMatch(releaseWorkflow, /workflows:\s*\n\s*- check/);
  assert.match(releaseWorkflow, /workflow_run\.conclusion == 'success'/);
  assert.match(releaseWorkflow, /startsWith\(github\.event\.workflow_run\.head_commit\.message, 'release:'\)/);
});
