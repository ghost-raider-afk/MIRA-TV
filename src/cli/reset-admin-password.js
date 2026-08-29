import { loadConfig } from '../config/index.js';
import { MenuTvStore } from '../db/index.js';
import { resetAdministratorPassword } from '../services/admin-recovery-service.js';

async function main() {
  const config = loadConfig();
  const store = new MenuTvStore(config.db);
  try {
    await store.init();
    const result = await resetAdministratorPassword({
      store,
      config,
      username: process.argv[2] || ''
    });
    console.log('Пароль администратора сброшен.');
    console.log(`Логин: ${result.username}`);
    console.log(`Новый пароль: ${result.password}`);
    console.log('Все ранее выданные веб-сессии этого администратора завершены.');
  } finally {
    await store.close();
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error?.message || error}`);
  process.exitCode = 1;
});
