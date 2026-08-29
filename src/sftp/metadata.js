import crypto from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';

const PUBLISHED_FILE = /^(?!\.)[a-z0-9][a-z0-9._-]{0,127}$/i;

async function digestRegularFileNoFollow(filename) {
  let handle;
  try {
    handle = await fs.open(filename, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile()) return null;
    const hash = crypto.createHash('sha256');
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
    return { size: stat.size, sha256: hash.digest('hex'), modified_at: stat.mtime.toISOString() };
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ELOOP') return null;
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function listPublishedFilesStreaming(storage, name) {
  const directory = await storage.verifiedPublishedDirectory(name);
  if (!directory) return [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink() || !PUBLISHED_FILE.test(entry.name)) continue;
    const metadata = await digestRegularFileNoFollow(storage.publishedFilePath(name, entry.name));
    if (metadata) files.push({ name: entry.name, ...metadata });
  }
  return files.sort((left, right) => right.modified_at.localeCompare(left.modified_at) || left.name.localeCompare(right.name));
}
