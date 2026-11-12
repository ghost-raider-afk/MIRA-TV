import { messengerProvider, messengerIdentityId } from '../bot/account-linking.js';
import { ValidationError } from '../shared/errors.js';

function validHash(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new ValidationError('Некорректный хеш кода привязки.');
  }
  return value;
}

export function createMessengerLinksRepository(pool) {
  return Object.freeze({
    async issueMessengerLinkCode(username, provider, codeHash, expiresAt) {
      const platform=messengerProvider(provider);
      const hash=validHash(codeHash);
      if (typeof expiresAt!=='string' || !Number.isFinite(Date.parse(expiresAt))) {
        throw new ValidationError('Некорректный срок действия кода.');
      }
      const { rows }=await pool.query(
        `INSERT INTO messenger_link_codes AS current
           (username,provider,code_hash,created_at,expires_at)
         SELECT u.username,$2,$3,NOW(),$4::timestamptz
           FROM web_users u WHERE u.username=$1 AND u.active=TRUE
         ON CONFLICT(username,provider) DO UPDATE
           SET code_hash=EXCLUDED.code_hash,
               created_at=EXCLUDED.created_at,
               expires_at=EXCLUDED.expires_at,consumed_at=NULL
         WHERE current.consumed_at IS NOT NULL
            OR current.created_at <= NOW() - INTERVAL '30 seconds'
         RETURNING expires_at`,
        [username,platform,hash,expiresAt]
      );
      return rows[0]?.expires_at || null;
    },

    // Must only receive an authenticated messenger identity in the bot
    // integration. Never expose this operation to untrusted public JSON.
    // Single SQL statement: on unique-identity conflict consumption rolls back.
    async redeemMessengerLinkCode(provider, codeHash, providerUserId) {
      const platform=messengerProvider(provider);
      const hash=validHash(codeHash);
      const identity=messengerIdentityId(providerUserId);
      const { rows }=await pool.query(
        `WITH consumed AS (
           UPDATE messenger_link_codes AS c SET consumed_at=NOW()
            WHERE c.provider=$1 AND c.code_hash=$2
              AND c.consumed_at IS NULL AND c.expires_at > NOW()
              AND EXISTS(SELECT 1 FROM web_users u
                         WHERE u.username=c.username AND u.active=TRUE)
           RETURNING c.username
         ), linked AS (
           INSERT INTO messenger_accounts(username,provider,provider_user_id,linked_at)
           SELECT username,$1,$3,NOW() FROM consumed
           ON CONFLICT(username,provider) DO UPDATE
             SET provider_user_id=EXCLUDED.provider_user_id,
                 linked_at=EXCLUDED.linked_at
           RETURNING username,provider,provider_user_id,linked_at
         )
         SELECT username,provider,provider_user_id,linked_at FROM linked`,
        [platform,hash,identity]
      );
      return rows[0] || null;
    },

    async listMessengerAccounts(username) {
      const { rows }=await pool.query(
        `SELECT provider,provider_user_id,linked_at
           FROM messenger_accounts
          WHERE username=$1 ORDER BY provider`,[username]);
      return rows;
    },

    async revokeMessengerAccount(username,provider) {
      const platform=messengerProvider(provider);
      const { rows }=await pool.query(
        `WITH cleared AS (
           DELETE FROM messenger_link_codes
            WHERE username=$1 AND provider=$2
            RETURNING code_hash
         )
         DELETE FROM messenger_accounts
          WHERE username=$1 AND provider=$2 RETURNING provider`,
        [username,platform]
      );
      return rows.length>0;
    },

    async resolveMessengerAccount(provider,providerUserId) {
      const platform=messengerProvider(provider);
      const id=messengerIdentityId(providerUserId);
      const { rows }=await pool.query(
        `SELECT u.username,u.role,u.session_version
           FROM messenger_accounts a
           JOIN web_users u ON u.username=a.username AND u.active=TRUE
          WHERE a.provider=$1 AND a.provider_user_id=$2`,
        [platform,id]
      );
      return rows[0] || null;
    }
  });
}
