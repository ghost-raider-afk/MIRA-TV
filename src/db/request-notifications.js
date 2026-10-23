// Per-user request delivery state; independent of activity_events.
function bounded(value, fallback, maximum) {
  const n=Number(value);
  return Number.isSafeInteger(n)&&n>0?Math.min(n,maximum):fallback;
}
export function createRequestNotificationsRepository(db) {
  return Object.freeze({
    async listRequestNotifications(username,{cursor=null,limit=30}={}) {
      const size=bounded(limit,30,30);
      const after=Number(cursor);
      const useCursor=Number.isSafeInteger(after)&&after>0;
      const {rows}=await db.query(
        'SELECT id,proposal_id,kind,title,location_name,created_at,read_at FROM request_notifications '+
        'WHERE username=$1 AND archived_at IS NULL'+(useCursor?' AND id<$3':'')+
        ' ORDER BY id DESC LIMIT $2',useCursor?[username,size,after]:[username,size]);
      const {rows:count}=await db.query(
        'SELECT COUNT(*)::int AS unread_count FROM request_notifications WHERE username=$1 AND archived_at IS NULL AND read_at IS NULL',[username]);
      return {items:rows,unread_count:Number(count[0].unread_count),next_cursor:rows.length===size?rows.at(-1).id:null};
    },
    async claimRequestNotifications(username) {
      const {rows}=await db.query(`
        WITH picked AS (
          SELECT id FROM request_notifications
          WHERE username=$1 AND archived_at IS NULL AND presented_at IS NULL
          ORDER BY id DESC LIMIT 3 FOR UPDATE SKIP LOCKED
        )
        UPDATE request_notifications n SET presented_at=NOW()
        FROM picked WHERE n.id=picked.id
        RETURNING n.id,n.proposal_id,n.kind,n.title,n.location_name,n.created_at
      `,[username]);
      return rows.sort((a,b)=>Number(b.id)-Number(a.id));
    },
    async readRequestNotification(username,id) {
      const {rowCount}=await db.query(
        'UPDATE request_notifications SET read_at=COALESCE(read_at,NOW()),presented_at=COALESCE(presented_at,NOW()) WHERE username=$1 AND id=$2 AND archived_at IS NULL',
        [username,id]);
      return rowCount>0;
    },
    async readAllRequestNotifications(username) {
      const {rowCount}=await db.query(
        'UPDATE request_notifications SET read_at=NOW(),presented_at=COALESCE(presented_at,NOW()) WHERE username=$1 AND archived_at IS NULL AND (read_at IS NULL OR presented_at IS NULL)',[username]);
      return rowCount;
    },
    async clearRequestNotifications(username) {
      const {rowCount}=await db.query(
        'UPDATE request_notifications SET archived_at=NOW() WHERE username=$1 AND archived_at IS NULL',[username]);
      return rowCount;
    },
    async setRequestSound(username,enabled) {
      const {rows}=await db.query(
        'UPDATE user_preferences SET request_sound_enabled=$2,updated_at=NOW() WHERE username=$1 RETURNING request_sound_enabled',
        [username,enabled]);
      return rows[0]?.request_sound_enabled??false;
    }
  });
}
