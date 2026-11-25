const MANIFEST='pool-status-v3-manifest',PREFIX='pool-status-v3-part-',CHARS=24_000;

// Each UTF-8 value stays below the Durable Object KV 128 KiB value limit.
// A transaction replaces all parts and the manifest atomically.
export async function loadPoolCache(storage,onParts=()=>{}){
  const manifest=await storage.get(MANIFEST);
  if(!manifest)return storage.get('pool-status-v2');
  if(!Number.isInteger(manifest.parts)||manifest.parts<1||manifest.parts>512)throw new Error('INVALID_POOL_CACHE');
  const parts=await Promise.all(Array.from({length:manifest.parts},(_,i)=>storage.get(PREFIX+i)));
  if(parts.some(x=>typeof x!=='string'))throw new Error('INCOMPLETE_POOL_CACHE');
  onParts(parts);
  return JSON.parse(parts.join(''));
}

export async function savePoolCache(storage,json,previous=[]){
  const parts=Array.from({length:Math.ceil(json.length/CHARS)},(_,i)=>json.slice(i*CHARS,(i+1)*CHARS));
  if(parts.length>512)throw new Error('POOL_CACHE_TOO_LARGE');
  const changed=parts.flatMap((value,i)=>previous[i]===value?[]:[[PREFIX+i,value]]);
  if(!changed.length&&parts.length===previous.length)return parts;
  await storage.transaction(async tx=>{
    for(let start=0;start<changed.length;start+=64)await tx.put(Object.fromEntries(changed.slice(start,start+64)));
    for(let start=parts.length;start<previous.length;start+=64)await tx.delete(Array.from({length:Math.min(64,previous.length-start)},(_,i)=>PREFIX+(start+i)));
    if(parts.length!==previous.length)await tx.put(MANIFEST,{parts:parts.length});
  });
  return parts;
}
