import crypto from 'node:crypto';
import fs from 'node:fs';
const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`:JSON.stringify(v);
const envelope=JSON.parse(fs.readFileSync(new URL('./exemplo-linhas.json',import.meta.url),'utf8'));
const stable=structuredClone(envelope);if(stable.payload?.asset){delete stable.payload.asset.url;delete stable.payload.asset.expires_at;}
const checksum=crypto.createHash('sha256').update(canonical(stable)).digest('hex');
const {payload,...event}=envelope;event.checksum=checksum;
const body=JSON.stringify(event),timestamp=String(Math.floor(Date.now()/1000));
// EXEMPLO ARTIFICIAL. Substituir pelo segredo acordado; nunca versionar o real.
const fakeSecret='0'.repeat(64);
const signature=crypto.createHmac('sha256',fakeSecret).update(timestamp+'.'+body).digest('hex');
console.log(JSON.stringify({body,headers:{'X-PF-Timestamp':timestamp,'X-PF-Signature':signature}},null,2));
