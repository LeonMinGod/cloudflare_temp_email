export function normalizeProvider(value){
  const raw=String(value||'').trim().toLowerCase();
  if(!raw)return 'other';
  if(['anthropic','claude','claude-api-key'].includes(raw))return 'claude';
  if(['gemini','gemini-cli','aistudio','vertex','gemini-api-key','vertex-api-key'].includes(raw))return 'gemini';
  if(['xai','grok'].includes(raw))return 'xai';
  if(['codex','codex-api-key'].includes(raw))return 'codex';
  if(raw==='mistral-bridge')return 'mistral';
  if(raw==='openai-api-key')return 'openai';
  if(raw==='openai-compatible'||raw==='openai-compatibility')return 'other';
  const compat=raw.match(/^openai-compatible-(.+)$/);
  if(compat&&/^[a-z0-9][a-z0-9._-]{0,63}$/.test(compat[1]))return compat[1];
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(raw)?raw:'other';
}
export const normalizeModelId=(id,provider)=>provider==='mistral'&&id.startsWith('mistral-bridge/')&&id.length>'mistral-bridge/'.length
  ?id.slice('mistral-bridge/'.length):id;
export const providerKey=normalizeProvider;
const providerOrder=['codex','openai','claude','gemini','antigravity','xai','deepseek','qwen','siliconflow','openrouter','iflow','kiro','copilot'];
export const providerRank=value=>{
  const key=providerKey(value);
  if(key==='other')return 100;
  const i=providerOrder.indexOf(key);
  return i<0?50:i;
};
export const compareProviders=(a,b)=>providerRank(a)-providerRank(b)||a.localeCompare(b,undefined,{numeric:true});
const featured=['gpt-6.1-sol','gpt-6.1-terra','gpt-6-astra','gpt-6-sol','gpt-6-luna','gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna'];
function modelRank(row){
  const id=row.id.toLowerCase(),pin=featured.indexOf(id);
  if(pin>=0)return pin;
  if(/^gpt-(?!image)/.test(id))return 30;
  if(/^claude/.test(id))return 40;
  if(/^gemini/.test(id))return 50;
  if(/^deepseek/.test(id))return 55;
  if(/^qwen/.test(id))return 58;
  if(/^grok-(?!imagine|tts|voice)/.test(id))return 60;
  if(/image|imagine|video|tts|voice/.test(id))return 80;
  if(/auto-review|embedding|internal/.test(id))return 100;
  return 70;
}
export function compareModels(a,b){
  const factory=row=>Math.min(...(row.providers?.length?row.providers:['other']).map(providerRank));
  return factory(a)-factory(b)||modelRank(a)-modelRank(b)||a.id.localeCompare(b.id,undefined,{numeric:true});
}
export const stateRank={ready:0,cooldown:1,error:2,unknown:3,disabled:4};
export function compareAccounts(a,b){
  return (stateRank[a.state]??3)-(stateRank[b.state]??3)||compareProviders(a.provider,b.provider)||((b.success||0)+(b.failed||0))-((a.success||0)+(a.failed||0))||(a.masked_email||a.channel_name||'').localeCompare(b.masked_email||b.channel_name||'')||a.id.localeCompare(b.id);
}
