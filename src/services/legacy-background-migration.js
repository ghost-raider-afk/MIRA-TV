import path from 'node:path';
import { mkdir, readdir, rename, stat, unlink, rmdir } from 'node:fs/promises';

const SAFE_BACKGROUND = /^background-[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;

async function exists(target) {
  try { await stat(target); return true; }
  catch { return false; }
}

export async function migrateLegacyBackgroundAssets(siteAssetsRoot) {
  const legacyDirectory = path.join(siteAssetsRoot, 'templates');
  if (!await exists(legacyDirectory)) return;
  const screenDirectory = path.join(siteAssetsRoot, 'screens');
  await mkdir(screenDirectory, { recursive: true, mode: 0o770 });
  const names = await readdir(legacyDirectory).catch(() => []);
  for (const name of names) {
    if (!SAFE_BACKGROUND.test(name)) continue;
    const source = path.join(legacyDirectory, name);
    const target = path.join(screenDirectory, name);
    if (await exists(target)) await unlink(source).catch(() => undefined);
    else await rename(source, target).catch(() => undefined);
  }
  await rmdir(legacyDirectory).catch(() => undefined);
}
