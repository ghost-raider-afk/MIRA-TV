import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function publishError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export class SftpPublisher {
  constructor(storage) {
    this.storage = storage;
  }

  async publishedInfo(directoryName, deliveryFilename) {
    return this.storage.publishedInfo(directoryName, deliveryFilename);
  }

  async publish({ directoryName, deliveryFilename, stagedKey, expectedSha256 }) {
    if (await this.storage.directoryStatus(directoryName) !== 'ready') {
      throw publishError('Физический каталог SFTP не найден.', 409);
    }
    const source = this.storage.stagedPath(stagedKey);
    const directory = this.storage.directoryPath(directoryName);
    const target = this.storage.deliveryPath(directoryName, deliveryFilename);
    const temporary = path.join(directory, `.${crypto.randomUUID()}.tmp`);
    try {
      await fs.copyFile(source, temporary);
      await fs.chmod(temporary, 0o640);
      await fs.rename(temporary, target);
      const info = await this.storage.publishedInfo(directoryName, deliveryFilename);
      if (!info || (expectedSha256 && info.sha256 !== expectedSha256)) {
        throw publishError('Контрольная сумма опубликованного JPEG не совпала.', 502);
      }
      return info;
    } catch (error) {
      await fs.unlink(temporary).catch(() => undefined);
      if (error?.status) throw error;
      if (error.code === 'ENOENT') throw publishError('Подготовленный JPEG не найден. Загрузите файл снова.', 409);
      throw publishError('Не удалось опубликовать JPEG в SFTP-каталог.');
    }
  }
}
