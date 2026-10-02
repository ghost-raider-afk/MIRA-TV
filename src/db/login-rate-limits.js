function normaliseLimit(row) {
  if (!row) return null;
  return {
    scope: row.scope,
    key_hash: row.key_hash,
    attempts: Number(row.attempts),
    expires_at: row.expires_at,
    updated_at: row.updated_at
  };
}

export function createLoginRateLimitsRepository(pool) {
  return Object.freeze({
    async getActiveLoginRateLimits(identityKeyHash, ipKeyHash) {
      const { rows } = await pool.query(
        `SELECT scope, key_hash, attempts, expires_at, updated_at
           FROM login_rate_limits
          WHERE expires_at > NOW()
            AND ((scope = 'identity' AND key_hash = $1)
              OR (scope = 'ip' AND key_hash = $2))`,
        [identityKeyHash, ipKeyHash]
      );
      return rows.map(normaliseLimit);
    },

    async recordLoginFailure({ identityKeyHash, ipKeyHash, expiresAt, now }) {
      await pool.query('DELETE FROM login_rate_limits WHERE expires_at <= $1', [now]);
      const { rows } = await pool.query(
        `INSERT INTO login_rate_limits (scope, key_hash, attempts, expires_at, updated_at)
         VALUES
           ('identity', $1, 1, $3, $4),
           ('ip', $2, 1, $3, $4)
         ON CONFLICT (scope, key_hash) DO UPDATE
           SET attempts = CASE
                 WHEN login_rate_limits.expires_at > EXCLUDED.updated_at
                   THEN login_rate_limits.attempts + 1
                 ELSE 1
               END,
               expires_at = CASE
                 WHEN login_rate_limits.expires_at > EXCLUDED.updated_at
                   THEN login_rate_limits.expires_at
                 ELSE EXCLUDED.expires_at
               END,
               updated_at = EXCLUDED.updated_at
         RETURNING scope, key_hash, attempts, expires_at, updated_at`,
        [identityKeyHash, ipKeyHash, expiresAt, now]
      );
      return rows.map(normaliseLimit);
    },

    async clearLoginRateLimits(identityKeyHash, ipKeyHash) {
      const { rowCount } = await pool.query(
        `DELETE FROM login_rate_limits
          WHERE (scope = 'identity' AND key_hash = $1)
             OR (scope = 'ip' AND key_hash = $2)`,
        [identityKeyHash, ipKeyHash]
      );
      return rowCount;
    }
  });
}
