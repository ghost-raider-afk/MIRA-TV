import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('MIRA-TV v1.9.1 release metadata is synchronized while legacy package identity remains compatible', async () => {
  const [packageText, lockText, installer, changelog, workflow, releaseWorkflow] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../package-lock.json', import.meta.url), 'utf8'),
    readFile(new URL('../menu-tv-2.sh', import.meta.url), 'utf8'),
    readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
  ]);
  const pkg = JSON.parse(packageText);
  const lock = JSON.parse(lockText);
  const scriptVersion = installer.match(/^SCRIPT_VERSION="(\d+\.\d+\.\d+)"$/m)?.[1];

  assert.equal(pkg.name, 'menu-tv-2');
  assert.equal(pkg.version, '1.9.1');
  assert.match(pkg.description, /MIRA-TV/);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages?.['']?.version, pkg.version);
  assert.ok(changelog.includes(`## [${pkg.version}]`));
  assert.ok(scriptVersion, 'SCRIPT_VERSION must remain an independent semantic version');
  assert.doesNotMatch(installer, /MENU_TV_REF|\$BRANCH|^BRANCH=/m);
  assert.match(installer, /releases\/latest/);

  for (const job of ['node-check:', 'browser-visual:', 'clean-install-smoke:']) assert.match(workflow, new RegExp(job));
  assert.match(workflow, /push:\s*\n\s*branches: \[main\]/);
  assert.doesNotMatch(workflow, /release-and-cleanup:|gh release create|git push origin --delete/);

  assert.match(releaseWorkflow, /workflow_run:/);
  assert.match(releaseWorkflow, /workflows: \[check\]/);
  assert.match(releaseWorkflow, /branches: \[main\]/);
  assert.match(releaseWorkflow, /workflow_run\.conclusion == 'success'/);
  assert.match(releaseWorkflow, /workflow_run\.event == 'push'/);
  assert.match(releaseWorkflow, /contents: write/);
  assert.match(releaseWorkflow, /workflow_run\.head_sha/);
  assert.match(releaseWorkflow, /test "\$MAIN_SHA" = "\$VERIFIED_SHA"/);
  assert.match(releaseWorkflow, /git ls-remote --exit-code --tags/);
  assert.match(releaseWorkflow, /gh release create "\$TAG"/);
  assert.match(releaseWorkflow, /--target "\$VERIFIED_SHA"/);
  assert.doesNotMatch(releaseWorkflow, /git push origin --delete|release-and-cleanup/);
});
