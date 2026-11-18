import { advanceTvIncident, TV_OFFLINE_GRACE_MS } from '../bot/incident-state.js';

function short(value, max) {
  return [...String(value ?? '')].slice(0, max).join('');
}

export function createBotDeliveryRepository(pool) {
  return Object.freeze({
    // Call inside store.transaction: cursor movement and event creation are atomic.
    async stageRequestNotifications(limit = 200) {
      const { rows:cursorRows } = await pool.query(
        'SELECT last_notification_id FROM bot_notification_cursor WHERE id=1 FOR UPDATE');
      const lastId = String(cursorRows[0]?.last_notification_id || '0');
      const { rows } = await pool.query(
        'SELECT id FROM request_notifications WHERE id>$1 ORDER BY id LIMIT $2',
        [lastId, Math.max(1,Math.min(Number(limit)||200,200))]
      );
      if (!rows.length) return 0;
      const last = String(rows.at(-1).id);
      await pool.query(`
        INSERT INTO bot_outbox(event_key,username,provider,kind,location_name,subject,detail)
        SELECT 'crm:' || n.id::text,n.username,a.provider,
          CASE WHEN n.kind IN ('created','resubmitted') THEN 'request_new' ELSE 'request_updated' END,
          LEFT(n.location_name,100),'Заявка №' || n.proposal_id::text,
          LEFT((CASE n.kind
            WHEN 'created' THEN 'Создана'
            WHEN 'resubmitted' THEN 'Отправлена повторно'
            WHEN 'approved' THEN 'Завершена'
            WHEN 'rework' THEN 'На доработке'
            WHEN 'rejected' THEN 'Отклонена'
            WHEN 'conflict' THEN 'Ошибка'
            ELSE 'Обновлена' END) || ': ' || n.title,180)
          FROM request_notifications n
          JOIN messenger_accounts a ON a.username=n.username
          JOIN web_users u ON u.username=n.username AND u.active=TRUE
         WHERE n.id>$1 AND n.id<=$2 AND n.archived_at IS NULL
        ON CONFLICT(event_key,username,provider) DO NOTHING
      `,[lastId,last]);
      await pool.query('UPDATE bot_notification_cursor SET last_notification_id=$1 WHERE id=1',[last]);
      return rows.length;
    },

    async stageTvIncident(binding, online, nowMs = Date.now(), graceMs = TV_OFFLINE_GRACE_MS) {
      const screenId=Number(binding.screen_id),locationId=Number(binding.location_id);
      if (!Number.isSafeInteger(screenId) || screenId < 1 ||
          !Number.isSafeInteger(locationId) || locationId < 1) return null;
      const { rows }=await pool.query(
        'SELECT last_state,offline_since,notified FROM bot_screen_connection_state WHERE screen_id=$1 FOR UPDATE',
        [screenId]
      );
      const previous=rows[0] || null;
      const transition=advanceTvIncident(previous,online,nowMs,graceMs);
      if (!transition.changed) return null;
      const next=transition.next;
      await pool.query(`
        INSERT INTO bot_screen_connection_state(screen_id,last_state,offline_since,notified)
        VALUES($1,$2,$3,$4)
        ON CONFLICT(screen_id) DO UPDATE SET last_state=EXCLUDED.last_state,
          offline_since=EXCLUDED.offline_since,notified=EXCLUDED.notified
      `,[screenId,next.last_state,next.offline_since,next.notified]);

      if (!transition.kind) return null;
      const incidentKey='tv:'+screenId+':'+transition.incidentStartedAt+':'+transition.kind;
      const subject=Number(binding.location_number)>0 ? 'ТВ '+binding.location_number : short(binding.screen_name||'Телевизор',90);
      await pool.query(`
        INSERT INTO bot_outbox(event_key,username,provider,kind,location_name,subject,detail,location_id)
        SELECT $1,u.username,a.provider,$2,$3,$4,$5,$6
          FROM web_users u
          JOIN messenger_accounts a ON a.username=u.username
          LEFT JOIN manager_access ma ON ma.username=u.username
         WHERE u.active=TRUE
           AND (u.role='administrator' OR (u.role='manager' AND
             (COALESCE(ma.all_locations,FALSE) OR EXISTS(
               SELECT 1 FROM manager_location_access ml
                WHERE ml.username=u.username AND ml.location_id=$6))))
        ON CONFLICT(event_key,username,provider) DO NOTHING
      `,[
        incidentKey,transition.kind,short(binding.location_name,100),subject,
        transition.kind==='tv_offline'?'Связь отсутствует не менее '+Math.ceil(graceMs/1000)+' секунд':'Соединение восстановлено',
        locationId
      ]);
      return transition.kind;
    },

    async claimBotJobs(leaseToken, limit = 10) {
      if (typeof leaseToken!=='string' || !/^[0-9a-f-]{36}$/i.test(leaseToken)) throw new TypeError('Invalid bot lease token.');
      const {rows}=await pool.query(`
        WITH candidates AS (
          SELECT o.id FROM bot_outbox o
          JOIN web_users u ON u.username=o.username AND u.active=TRUE
          JOIN messenger_accounts a ON a.username=o.username AND a.provider=o.provider
          LEFT JOIN manager_access ma ON ma.username=o.username
         WHERE o.delivered_at IS NULL AND o.attempts<10 AND o.available_at<=NOW()
           AND (u.role='administrator' OR (u.role='manager' AND
             (o.kind IN ('request_new','request_updated') OR
               (o.location_id IS NOT NULL AND (COALESCE(ma.all_locations,FALSE) OR EXISTS(
                 SELECT 1 FROM manager_location_access ml
                  WHERE ml.username=o.username AND ml.location_id=o.location_id))))))
           AND (o.lease_expires_at IS NULL OR o.lease_expires_at<NOW())
           AND o.created_at>NOW()-INTERVAL '48 hours'
         ORDER BY o.id ASC LIMIT $2 FOR UPDATE OF o SKIP LOCKED
        )
        UPDATE bot_outbox o
           SET lease_token=$1,lease_expires_at=NOW()+INTERVAL '90 seconds',
               attempts=attempts+1
          FROM candidates WHERE o.id=candidates.id
        RETURNING o.id,o.provider,o.kind,o.location_name,o.subject,o.detail,
          o.username,o.attempts,
          (SELECT a.provider_user_id FROM messenger_accounts a
             JOIN web_users u ON u.username=a.username AND u.active=TRUE
            WHERE a.username=o.username AND a.provider=o.provider) AS recipient
      `,[leaseToken,Math.max(1,Math.min(Number(limit)||10,20))]);
      return rows.map(row=>({
        id:Number(row.id),provider:row.provider,kind:row.kind,
        location:row.location_name,subject:row.subject,detail:row.detail,
        recipient:row.recipient,attempts:Number(row.attempts)
      }));
    },

    async completeBotJob(id, leaseToken, success) {
      const number=Number(id);
      if (!Number.isSafeInteger(number) || number<1 ||
          typeof leaseToken!=='string' || !/^[0-9a-f-]{36}$/i.test(leaseToken) ||
          typeof success!=='boolean') throw new TypeError('Invalid bot delivery acknowledgement.');
      const {rowCount}=await pool.query(`
        UPDATE bot_outbox
           SET delivered_at=CASE WHEN $3 THEN NOW() ELSE delivered_at END,
               lease_token=NULL,lease_expires_at=NULL,
               available_at=CASE WHEN $3 THEN available_at ELSE
                 NOW()+MAKE_INTERVAL(secs=>LEAST(3600,(30*POWER(2,LEAST(attempts,7)))::integer)) END
         WHERE id=$1 AND lease_token=$2 AND delivered_at IS NULL
      `,[number,leaseToken,success]);
      return rowCount===1;
    }
  });
}
