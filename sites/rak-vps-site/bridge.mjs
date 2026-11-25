import { createHash,createHmac,timingSafeEqual } from 'node:crypto';
export const digest=raw=>createHash('sha256').update(raw).digest('hex');
export function bridgeMessage(meta,method,body){return 'lmg-origin-v1\n'+JSON.stringify(meta)+'\n'+method+'\n'+digest(body);}
export function verifyBridge(headers,method,body,secret,now=Date.now()){
  const packed=headers.get('X-LMG-Origin'),signature=headers.get('X-LMG-Origin-Signature');
  if(!packed||packed.length>30000||!/^[a-f0-9]{64}$/.test(signature||''))return null;
  let meta;try{meta=JSON.parse(Buffer.from(packed,'base64').toString());}catch{return null;}
  if(!Number.isSafeInteger(meta.at)||Math.abs(now-meta.at)>30000||!['site','guard'].includes(meta.role)||typeof meta.url!=='string'||typeof meta.ip!=='string')return null;
  const url=new URL(meta.url);
  if(url.protocol!=='https:'||!(meta.role==='site'?['leonmingod.com','www.leonmingod.com'].includes(url.hostname):url.hostname.endsWith('.workers.dev')))return null;
  const expected=createHmac('sha256',secret).update(bridgeMessage(meta,method,body)).digest();
  return timingSafeEqual(expected,Buffer.from(signature,'hex'))?meta:null;
}
