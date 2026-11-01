const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const progressPath=path.join(root,'swimmer-photo-progress.json');
async function readJson(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function queue(){
  const roster=await readJson(path.join(root,'swimmer-roster.json'),{swimmers:[]});
  const photos=await readJson(path.join(root,'swimmer-photos.json'),{});
  const progress=await readJson(progressPath,{});
  return {checked:Object.keys(progress).length,photos:Object.keys(photos).length,pending:roster.swimmers
    .filter(sw=>!progress[sw.usaSwimmingMemberId]&&!photos[sw.usaSwimmingMemberId])
    .map(sw=>({id:sw.usaSwimmingMemberId,name:sw.name}))};
}
async function saveRecord(record){
  const roster=await readJson(path.join(root,'swimmer-roster.json'),{swimmers:[]});
  const normalize=s=>String(s).trim().replace(/\s+/g,' ').toLowerCase();
  if(!/^[A-F0-9]{14}$/.test(record.id)||!roster.swimmers.some(sw=>sw.usaSwimmingMemberId===record.id&&normalize(sw.name)===normalize(record.name)))throw Error('Unverified swimmer identity');
  const photos=await readJson(path.join(root,'swimmer-photos.json'),{});
  if(record.download){
    const source=path.resolve(record.download),downloads=path.join(os.homedir(),'Downloads');
    if(path.dirname(source).toLowerCase()!==downloads.toLowerCase()||!/^[-a-f0-9]{36}\.jpg$/i.test(path.basename(source)))throw Error('Expected a downloaded profile JPEG');
    const bytes=await fs.readFile(source);
    if(bytes.length>15_000_000||bytes[0]!==0xff||bytes[1]!==0xd8)throw Error('Expected a JPEG under 15 MB');
    const relative=`ui-media/swimmers/${record.id}.jpg`;
    await fs.mkdir(path.join(root,'ui-media/swimmers'),{recursive:true});
    await fs.writeFile(path.join(root,relative),bytes);
    photos[record.id]=relative;
    await fs.writeFile(path.join(root,'swimmer-photos.json'),JSON.stringify(photos,null,2)+'\n');
  }
  const progress=await readJson(progressPath,{});
  progress[record.id]={name:record.name,status:record.download?'saved':'unavailable',checkedAt:new Date().toISOString()};
  await fs.writeFile(progressPath,JSON.stringify(progress,null,2)+'\n');
  return {id:record.id,status:progress[record.id].status};
}
function serve(port=5197){
  const token=crypto.randomBytes(32).toString('hex');
  return http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self'; frame-ancestors 'none'");
    try{
      if(req.method==='GET'&&req.url==='/queue'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await queue()));return;}
      if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html');res.end(`<title>LaneLine photo checkpoint</title><h1>Verified swimmer photo</h1><form method="post" action="/save"><input type="hidden" name="token" value="${token}"><label for="record">Verified photo record</label><textarea id="record" name="record"></textarea><button>Save photo check</button></form>`);return;}
      if(req.method!=='POST'||req.url!=='/save'){res.writeHead(404);res.end();return;}
      if(req.headers.origin!==`http://localhost:${port}`)throw Error('Local origin required');
      let body='';for await(const chunk of req){body+=chunk;if(body.length>10000)throw Error('Record too large');}
      const form=new URLSearchParams(body);if(form.get('token')!==token)throw Error('Invalid token');
      const result=await saveRecord(JSON.parse(form.get('record')));
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
    }catch(e){res.writeHead(400);res.end(e.message);}
  }).listen(port,'127.0.0.1');
}
module.exports={queue,saveRecord};
if(require.main===module)serve(Number(process.argv[2]||5197));
