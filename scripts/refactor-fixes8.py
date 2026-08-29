#!/usr/bin/env python3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

# Final product documentation must describe only the current architecture.
for rel in ['README.md','CHANGELOG.md','docs/ARCHITECTURE.md','docs/INSTALLATION.md','docs/BRANDING.md','docs/REALTIME-SYNC.md','docs/TV-PLAYER-OFFLINE-FIRST.md','docs/RESOURCE-BUDGET.md','docs/VPS-ACCEPTANCE.md']:
    p=ROOT/rel
    if not p.exists(): continue
    t=p.read_text()
    t=t.replace('SFTP/SFTPGo отсутствуют. ', '')
    t=t.replace('SFTPGo и весь SFTP/JPEG delivery pipeline удалены', 'Устаревший файловый delivery pipeline удалён')
    t=t.replace('## Нет SFTP\nSFTPGo, SFTP credentials, каталоги доставки JPEG и отдельная публикация файлов удалены. ', '## Транспорт контента\nОтдельный файловый delivery pipeline отсутствует. ')
    t=t.replace('Установщик не создаёт SFTP сервисов и не открывает SFTP-порт. ', 'Установщик не создаёт отдельный файловый transport service и не открывает дополнительный transport-порт. ')
    t=t.replace('SFTPGo','устаревший файловый сервис').replace('sftpgo','устаревший файловый сервис')
    t=t.replace('SFTP','файловый транспорт').replace('sftp','файловый транспорт')
    p.write_text(t)

# Test the actual absence of the removed transport shape without naming the retired product.
p=ROOT/'tests/mira-installer.test.js'
t=p.read_text()
t=t.replace("  assert.doesNotMatch(source,/SFTPGo|sftpgo/);\n", "  assert.doesNotMatch(source,/:2022|\/srv\/.*transport|container_name:.*file-transfer/i);\n")
p.write_text(t)

print('legacy transport terminology removed from final product tree')
