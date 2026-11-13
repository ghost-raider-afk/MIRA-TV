import express from 'express';
import {
  createMessengerLinkCode, messengerLinkCodeHash, messengerProvider, LINK_CODE_TTL_MS
} from '../../bot/account-linking.js';

// This router is mounted behind existing web session and origin protection.
// No endpoint redeems a code from an unverified messenger ID.
export function createMessengerLinksRouter({ store }) {
  const router=express.Router();
  router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});

  router.get('/accounts',async(req,res)=>res.json({
    accounts:await store.listMessengerAccounts(req.session.sub)
  }));
  router.post('/link-code',async(req,res)=>{
    const provider=messengerProvider(req.body?.provider);
    const code=createMessengerLinkCode();
    const expiry=await store.issueMessengerLinkCode(
      req.session.sub,provider,messengerLinkCodeHash(code),
      new Date(Date.now()+LINK_CODE_TTL_MS).toISOString()
    );
    if(!expiry){
      res.set('Retry-After','30');
      return res.status(429).json({error:'Новый код можно запросить через 30 секунд.'});
    }
    return res.status(201).json({provider,code,expires_at:expiry});
  });
  router.delete('/accounts/:provider',async(req,res)=>{
    const provider=messengerProvider(req.params.provider);
    return res.json({revoked:await store.revokeMessengerAccount(req.session.sub,provider)});
  });
  return router;
}
