import express from 'express';
import { ValidationError } from '../../shared/errors.js';
function validId(value) {
  const id=Number(value);
  if(!Number.isSafeInteger(id)||id<1)throw new ValidationError('Некорректный номер уведомления.');
  return id;
}
export function createRequestNotificationsRouter({store,requestNotifications}) {
  const router=express.Router();
  router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
  router.get('/',async(req,res)=>res.json(await store.listRequestNotifications(req.session.sub,{
    cursor:req.query.cursor,limit:req.query.limit
  })));
  router.get('/stream',(req,res)=>requestNotifications.subscribe(req.session.sub,req,res));
  router.post('/claim',async(req,res)=>res.json({items:await store.claimRequestNotifications(req.session.sub)}));
  router.post('/read-all',async(req,res)=>res.json({count:await store.readAllRequestNotifications(req.session.sub)}));
  router.post('/:id/read',async(req,res)=>res.json({
    marked:await store.readRequestNotification(req.session.sub,validId(req.params.id))
  }));
  router.delete('/',async(req,res)=>res.json({count:await store.clearRequestNotifications(req.session.sub)}));
  router.put('/sound',async(req,res)=>{
    if(typeof req.body?.enabled!=='boolean')throw new ValidationError('Неизвестное состояние звука.');
    res.json({enabled:await store.setRequestSound(req.session.sub,req.body.enabled)});
  });
  return router;
}
