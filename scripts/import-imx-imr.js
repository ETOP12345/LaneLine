const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const dataPath=path.join(root,'imx-imr-data.json');
const queuePath=path.join(root,'imx-imr-import-progress.json');
const seeds=[['9DCE8A4B52EF4A','Ethan Wang'],['529E741DB1114E','Quinlan Tian'],['C8B64773962AF0','Iris Wang'],['03A64F943FE144','Alex Wang'],['08104D29B8F2BE','Aditeya Verma'],['7EFADA7A593345','Jayden Sun'],['1D0A99255F1747','Andrew Ouyang'],['F889DA85F5164C','Max Sun'],['9C37DAB7527E4C','Dan Sun']];
function initialize(){
  const data=fs.existsSync(dataPath)?JSON.parse(fs.readFileSync(dataPath,'utf8')):{source:'USA Swimming Data Hub visible Analytics tab',swimmers:{}};
  const queue=fs.existsSync(queuePath)?JSON.parse(fs.readFileSync(queuePath,'utf8')):{swimmers:{}};
  const roster=[...seeds.map(([usaSwimmingMemberId,name])=>({usaSwimmingMemberId,name})),...JSON.parse(fs.readFileSync(path.join(root,'swimmer-roster.json'),'utf8')).swimmers];
  for(const sw of roster)if(sw.usaSwimmingMemberId&&!queue.swimmers[sw.usaSwimmingMemberId])queue.swimmers[sw.usaSwimmingMemberId]={name:sw.name,status:'pending'};
  if(!data.swimmers[seeds[0][0]]){
    const api=require('../imx-imr');
    data.swimmers[seeds[0][0]]={name:'Ethan Wang',checkedAt:api.checkedAt,programs:['IMX','IMR'],records:[...api.records(seeds[0][0],'IMX'),...api.records(seeds[0][0],'IMR')]};
    queue.swimmers[seeds[0][0]].status='complete';
  }
  return {data,queue};
}
function importScores(snapshot,state){
  const {memberId,name,programs}=snapshot;
  if(!Array.isArray(snapshot.records))throw Error('Missing verified records');
  const records=snapshot.records.map(r=>Array.isArray(r)?{program:r[0],course:r[1],season:String(r[2]),age:r[3],score:r[4],ranks:{club:r[5],lsc:r[6],zone:r[7],national:r[8]},eventCount:r[9]||5,events:[]}:r);
  if(!state.queue.swimmers[memberId]||name.toLowerCase()!==state.queue.swimmers[memberId].name.toLowerCase())throw Error('Swimmer identity mismatch');
  if(!Array.isArray(programs)||!programs.length||programs.some(p=>!['IMX','IMR'].includes(p)))throw Error('Missing verified programs');
  for(const r of records){
    if(!programs.includes(r.program)||!['SCY','LCM','SCM'].includes(r.course)||!/^\d{4}(-\d{4})?$/.test(r.season)||!Number.isInteger(r.score)||r.score<0||!Number.isInteger(r.age))throw Error('Invalid score record');
    if(!r.ranks||['club','lsc','zone','national'].some(key=>r.ranks[key]!==null&&(!Number.isInteger(r.ranks[key])||r.ranks[key]<1)))throw Error('Invalid official rank');
    if(r.eventCount!==undefined&&![5,6].includes(r.eventCount))throw Error('Invalid counted event total');
  }
  const previous=state.data.swimmers[memberId];
  for(const r of records){
    const old=previous?.records.find(p=>p.program===r.program&&p.course===r.course&&p.season===r.season&&p.age===r.age&&p.score===r.score);
    if(!r.events?.length&&old?.events?.length)r.events=old.events;
  }
  const checkedAt=new Date().toISOString();
  state.data.swimmers[memberId]={name,checkedAt,programs:[...new Set([...(previous?.programs||[]),...programs])],records:[...(previous?.records||[]).filter(r=>!programs.includes(r.program)),...records]};
  state.queue.swimmers[memberId]={name,status:state.data.swimmers[memberId].programs.length===2?'complete':'partial',checkedAt};
  state.queue.status='in-progress';
}
function save(state){
  const entries=Object.values(state.queue.swimmers),complete=entries.filter(x=>x.status==='complete').length;
  if(complete===entries.length&&entries.length)state.queue.status='complete';
  for(const [file,value] of [[dataPath,state.data],[queuePath,state.queue]]){
    fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2)+'\n');fs.renameSync(file+'.tmp',file);
  }
  return {checked:complete,pending:entries.length-complete,total:entries.length};
}
function serve(port=5192){
  const token=require('node:crypto').randomBytes(32).toString('hex');
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let message='Ready';
  const server=require('node:http').createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method==='GET'&&req.url==='/'){
      const state=initialize(),counts=save(state);
      const next=Object.entries(state.queue.swimmers).find(([,s])=>['pending','partial'].includes(s.status));
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>LaneLine score import</title><h1>Official IMX / IMR import</h1><p id="result">${escape(message)}</p><p id="counts">${counts.checked} checked, ${counts.pending} pending, ${counts.total} total</p>${next?`<section><h2>Next swimmer</h2><p id="next-name">${escape(next[1].name)}</p><p id="next-id">${escape(next[0])}</p><a id="next-profile" href="https://data.usaswimming.org/search/athlete/${encodeURIComponent(next[0])}/imx-imr?program=IMX">Open official Analytics</a></section>`:'<p>All swimmers checked.</p>'}<form method="post" action="/import"><input type="hidden" name="token" value="${token}"><label for="snapshot">Verified official scores</label><br><textarea id="snapshot" name="snapshot" rows="15" cols="90"></textarea><br><button type="submit">Save verified scores</button></form></html>`);return;
    }
    if(req.method!=='POST'||req.url!=='/import'){res.writeHead(404);res.end();return;}
    if(![`http://localhost:${port}`,`http://127.0.0.1:${port}`].includes(req.headers.origin)){res.writeHead(403);res.end('Local origin required');return;}
    try{
      let body='';for await(const chunk of req){body+=chunk;if(body.length>2_000_000)throw Error('Snapshot too large');}
      const form=new URLSearchParams(body);if(form.get('token')!==token)throw Error('Invalid form token');
      const state=initialize(),snapshot=JSON.parse(form.get('snapshot'));importScores(snapshot,state);const counts=save(state);
      message=`Saved ${snapshot.name}: ${snapshot.records.length} official score records. ${counts.checked} checked.`;
      res.writeHead(303,{Location:'/'});res.end();
    }catch(error){res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'});res.end(error.message);}
  });
  server.listen(port,'127.0.0.1',()=>console.log(`Local IMX import: http://localhost:${port}`));return server;
}
if(require.main===module){if(process.argv[2]==='--serve')serve();else{const state=initialize();if(process.argv[2]){const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));for(const snapshot of Array.isArray(input)?input:[input]){importScores(snapshot,state);save(state);}}console.log(JSON.stringify(save(state)));}}
module.exports={initialize,importScores,save,serve};
