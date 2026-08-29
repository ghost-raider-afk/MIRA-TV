import crypto from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const STAGED_KEY = /^[1-9][0-9]*-[0-9a-f-]{36}\.jpg$/i;
const DELIVERY_FILE = /^[a-z0-9-]+\.jpg$/i;
const PUBLISHED_FILE = /^(?!\.)[a-z0-9][a-z0-9._-]{0,127}$/i;

function storageError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function readRegularFileNoFollow(filename) {
  let handle;
  try {
    handle = await fs.open(filename, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile()) throw storageError('Опубликованный файл не найден.', 404);
    const bytes = await handle.readFile();
    return { bytes, stat };
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ELOOP') throw storageError('Опубликованный файл не найден.', 404);
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function fileDigest(filename) {
  const { bytes } = await readRegularFileNoFollow(filename);
  return {
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length
  };
}

export class SftpStorage {
  constructor(storageRoot) {
    this.root = path.resolve(storageRoot);
    this.stagingRoot = path.join(this.root, '.staging');
  }

  directoryPath(name) {
    const candidate = path.resolve(this.root, name);
    const relative = path.relative(this.root, candidate);
    if (relative === '' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw storageError('Недопустимый каталог SFTP.', 400);
    }
    return candidate;
  }

  stagedPath(key) {
    if (!STAGED_KEY.test(String(key || ''))) throw storageError('Недопустимый ключ подготовленного файла.', 400);
    return path.join(this.stagingRoot, key);
  }

  deliveryPath(directoryName, deliveryFilename) {
    if (!DELIVERY_FILE.test(String(deliveryFilename || ''))) throw storageError('Недопустимое имя файла публикации.', 400);
    return path.join(this.directoryPath(directoryName), deliveryFilename);
  }

  publishedFilePath(directoryName, filename) {
    if (!PUBLISHED_FILE.test(String(filename || ''))) throw storageError('Недопустимое имя опубликованного файла.', 400);
    return path.join(this.directoryPath(directoryName), filename);
  }

  async verifiedPublishedDirectory(name) {
    const directory = this.directoryPath(name);
    try {
      const stat = await fs.lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw storageError('Каталог SFTP недоступен для просмотра.', 409);
      return directory;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      if (error?.status) throw error;
      throw storageError('Не удалось проверить каталог SFTP.');
    }
  }

  async directoryStatus(name) {
    try {
      const stat = await fs.lstat(this.directoryPath(name));
      return stat.isDirectory() && !stat.isSymbolicLink() ? 'ready' : 'missing';
    } catch (error) {
      if (error.code === 'ENOENT') return 'missing';
      throw storageError('Не удалось проверить каталог SFTP.');
    }
  }

  async provisionDirectory(name) {
    const directory = this.directoryPath(name);
    try {
      await fs.mkdir(directory, { recursive: false, mode: 0o750 });
      await fs.chmod(directory, 0o750);
      return 'created';
    } catch (error) {
      if (error.code === 'EEXIST') {
        const stat = await fs.lstat(directory);
        if (stat.isDirectory() && !stat.isSymbolicLink()) return 'exists';
      }
      throw storageError('Не удалось создать каталог SFTP.');
    }
  }

  async directorySummary(name) {
    const directory = await this.verifiedPublishedDirectory(name);
    if (!directory) return { file_count: 0, total_bytes: 0, last_modified_at: null };
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      throw storageError('Не удалось прочитать опубликованный каталог SFTP.');
    }
    let fileCount = 0;
    let totalBytes = 0;
    let lastModifiedAt = null;
    for (const entry of entries) {
      if (!entry.isFile() || entry.isSymbolicLink() || !PUBLISHED_FILE.test(entry.name)) continue;
      const stat = await fs.lstat(this.publishedFilePath(name, entry.name));
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      fileCount += 1;
      totalBytes += stat.size;
      if (!lastModifiedAt || stat.mtime > lastModifiedAt) lastModifiedAt = stat.mtime;
    }
    return { file_count: fileCount, total_bytes: totalBytes, last_modified_at: lastModifiedAt?.toISOString() || null };
  }

  async listPublishedFiles(name) {
    const directory = await this.verifiedPublishedDirectory(name);
    if (!directory) return [];
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      throw storageError('Не удалось прочитать опубликованный каталог SFTP.');
    }
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile() || entry.isSymbolicLink() || !PUBLISHED_FILE.test(entry.name)) continue;
      const filename = this.publishedFilePath(name, entry.name);
      try {
        const { bytes, stat } = await readRegularFileNoFollow(filename);
        files.push({
          name: entry.name,
          size: bytes.length,
          sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
          modified_at: stat.mtime.toISOString()
        });
      } catch (error) {
        if (error?.status === 404) continue;
        throw error;
      }
    }
    return files.sort((left, right) => right.modified_at.localeCompare(left.modified_at) || left.name.localeCompare(right.name));
  }

  async readPublishedFile(directoryName, filename) {
    const directory = await this.verifiedPublishedDirectory(directoryName);
    if (!directory) throw storageError('Опубликованный файл не найден.', 404);
    const filePath = this.publishedFilePath(directoryName, filename);
    try {
      const { bytes, stat } = await readRegularFileNoFollow(filePath);
      return {
        name: filename,
        bytes,
        size: bytes.length,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        modified_at: stat.mtime.toISOString()
      };
    } catch (error) {
      if (error?.status) throw error;
      throw storageError('Не удалось прочитать опубликованный файл SFTP.');
    }
  }

  async stageJpeg(screenId, bytes) {
    if (!Buffer.isBuffer(bytes) || bytes.length < 5 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
      throw storageError('Нужен файл JPEG.', 400);
    }
    await fs.mkdir(this.stagingRoot, { recursive: true, mode: 0o750 });
    const key = `${screenId}-${crypto.randomUUID()}.jpg`;
    await fs.writeFile(this.stagedPath(key), bytes, { mode: 0o640 });
    return { key, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
  }

  async removeStaged(key) {
    if (!key) return false;
    const filename = this.stagedPath(key);
    try {
      await fs.unlink(filename);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw storageError('Не удалось удалить подготовленный JPEG.');
    }
  }

  async publishedInfo(directoryName, deliveryFilename) {
    try {
      return await fileDigest(this.deliveryPath(directoryName, deliveryFilename));
    } catch (error) {
      if (error.code === 'ENOENT' || error?.status === 404) return null;
      throw storageError('Не удалось проверить опубликованный JPEG.');
    }
  }

  async cleanupStaging(keepKeys = [], { maxAgeMs = 60 * 60 * 1000 } = {}) {
    const keep = new Set((keepKeys || []).filter((key) => STAGED_KEY.test(String(key || ''))));
    let entries;
    try {
      entries = await fs.readdir(this.stagingRoot, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return { removed: 0 };
      throw storageError('Не удалось проверить временные JPEG.');
    }

    const maximumAge = Math.max(0, Number(maxAgeMs) || 0);
    const cutoff = Date.now() - maximumAge;
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !STAGED_KEY.test(entry.name) || keep.has(entry.name)) continue;
      if (maximumAge > 0) {
        const stat = await fs.stat(this.stagedPath(entry.name)).catch(() => null);
        if (!stat || stat.mtimeMs > cutoff) continue;
      }
      if (await this.removeStaged(entry.name)) removed += 1;
    }
    return { removed };
  }
}
