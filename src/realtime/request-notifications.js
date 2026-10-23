// One PG LISTEN connection distributes transactional invalidations to web users.
export function createRequestNotificationHub(pool) {
  const subscribers=new Map();
  let connection=null,closed=false,retry=null,heartbeat=null;
  function scheduleRetry() {
    if(closed||retry||!pool?.connect)return;
    retry=setTimeout(()=>{retry=null;void connect();},5000);
    retry.unref?.();
  }
  async function connect() {
    if(closed||connection||!pool?.connect)return;
    let client;
    try {
      client=await pool.connect();
      await client.query('LISTEN mira_request_notifications');
      if(closed){client.release();return;}
      connection=client;
      client.on('notification',({channel,payload})=>{
        if(channel!=='mira_request_notifications')return;
        for(const response of subscribers.get(payload)||[]) {
          try{response.write('event: changed\ndata: {}\n\n');}
          catch{subscribers.get(payload)?.delete(response);}
        }
      });
      const lost=()=>{
        if(connection!==client)return;
        connection=null;
        try{client.release();}catch{}
        scheduleRetry();
      };
      client.on('error',lost);
      client.on('end',lost);
    }catch{
      if(client)try{client.release();}catch{}
      scheduleRetry();
    }
  }
  function start() {
    if(!heartbeat) {
      heartbeat=setInterval(()=>{
        for(const clients of subscribers.values())for(const response of clients) {
          try{response.write(': heartbeat\n\n');}catch{clients.delete(response);}
        }
      },45000);
      heartbeat.unref?.();
    }
    void connect();
  }
  function subscribe(username,request,response) {
    response.status(200);
    response.set({
      'Content-Type':'text/event-stream; charset=utf-8',
      'Cache-Control':'no-cache, no-transform',
      'X-Accel-Buffering':'no',
      'Connection':'keep-alive'
    });
    response.flushHeaders();
    response.write('retry: 5000\n\n');
    let clients=subscribers.get(username);
    if(!clients){clients=new Set();subscribers.set(username,clients);}
    clients.add(response);
    request.once('close',()=>{
      clients.delete(response);
      if(!clients.size)subscribers.delete(username);
    });
  }
  function close() {
    closed=true;clearTimeout(retry);clearInterval(heartbeat);
    for(const clients of subscribers.values())for(const response of clients)response.end();
    subscribers.clear();
    if(connection){const c=connection;connection=null;c.release();}
  }
  return {start,subscribe,close};
}
