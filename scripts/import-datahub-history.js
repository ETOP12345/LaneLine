const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { mergeRows } = require('./refresh-swimmer-history');
const standards = require('../standards-engine');
const standardsData = require('../time-standards.json');

const root = path.resolve(__dirname, '..');

async function importSnapshot(snapshot, directory = root) {
  const youngerScope=snapshot.scope==='pns-a-9-10';
  const pnsScope=youngerScope||snapshot.scope==='pns-a-10-14';
  const ageLabel=youngerScope?'9-10':'10-14';
  const allowedAges=youngerScope?['9','10']:['10','11','12','13','14'];
  const progressName=youngerScope?'pns-a-9-10-import-progress.json':pnsScope?'pns-a-import-progress.json':'roster-import-progress.json';
  const historyPath = path.join(directory, 'datahub-history.json');
  const statusPath = path.join(directory, 'datahub-refresh-status.json');
  const histories = JSON.parse(await fs.readFile(historyPath, 'utf8'));
  const status = JSON.parse(await fs.readFile(statusPath, 'utf8'));
  const rosterPath = path.join(directory, 'swimmer-roster.json');
  let roster = {source:'USA Swimming Data Hub',complete:false,swimmers:[]};
  try {roster=JSON.parse(await fs.readFile(rosterPath,'utf8'));}
  catch(error) {if(error.code!=='ENOENT') throw error;}
  const checkedAt = new Date().toISOString();
  const imported = {};
  const strokeNames = {FR:'Free',BK:'Back',BR:'Breast',FL:'Fly',IM:'IM'};
  if (!Array.isArray(snapshot.meets) || !Array.isArray(snapshot.events) || !snapshot.swimmers) {
    throw new Error('Expected meets, events, and swimmers in the verified Data Hub snapshot.');
  }
  for (const profile of snapshot.profiles || []) {
    const id=profile.usaSwimmingMemberId;
    if (!/^[A-F0-9]{14}$/.test(id || '') || !profile.name ||
        !(pnsScope?allowedAges:['11','12']).includes(profile.ageGroup) || !['girls','boys'].includes(profile.division) ||
        !(pnsScope?profile.lsc==='PN'&&Boolean(profile.team):['Bellevue Club Swim Team','Wave Aquatics','Pacific Dragons Swim Team'].includes(profile.team)) ||
        !Array.isArray(snapshot.swimmers[id]) || !snapshot.swimmers[id].length) {
      throw new Error('New profiles must have verified age, division, team, LSC, and race history for the selected scope.');
    }
    if(pnsScope){
      const qualifies=snapshot.swimmers[id].some(([eventIndex,time])=>{
        const code=snapshot.events[eventIndex]||'';
        const event=code.replace(/\b(FR|BK|BR|FL)\b/g,stroke=>strokeNames[stroke]);
        const cuts=standards.motivationalCuts(standardsData,event,profile);
        const swim=standards.centiseconds(time),cut=standards.centiseconds(cuts?.A);
        return Number.isFinite(swim)&&Number.isFinite(cut)&&swim<=cut;
      });
      if(!qualifies)throw new Error('No national motivational A-or-faster time for current age: '+profile.name);
    }
    const clean={id:'usas_'+id,name:profile.name,ageGroup:profile.ageGroup,division:profile.division,
      team:profile.team,usaSwimmingMemberId:id,bestTimes:[]};
    if(pnsScope){clean.lsc='PN';clean.inclusion='National motivational A or faster, current age';}
    const index=roster.swimmers.findIndex(sw=>sw.usaSwimmingMemberId===id);
    if(index<0) roster.swimmers.push(clean);else roster.swimmers[index]=clean;
    histories[id] ||= [];
  }
  for (const [memberId, values] of Object.entries(snapshot.swimmers)) {
    if (!Object.hasOwn(histories, memberId)) throw new Error('Unknown swimmer ID.');
    const rows = values.map(([eventIndex, time, meetIndex, date]) => {
      const eventCode = snapshot.events[eventIndex] || '';
      const match = eventCode.match(/^(\d+) (FR|BK|BR|FL|IM) (SCY|LCM|SCM)$/);
      if (!match || !snapshot.meets[meetIndex]) throw new Error('Invalid event or meet.');
      return {event:`${match[1]} ${strokeNames[match[2]]} ${match[3]}`,
        time,meet:snapshot.meets[meetIndex],date,source:'USA Swimming',course:match[3]};
    });
    const before = histories[memberId].length;
    histories[memberId] = mergeRows(histories[memberId], rows);
    imported[memberId] = {checkedRows: rows.length, addedRows:histories[memberId].length-before};
    status.swimmers[memberId] = {
      status:'manual',checkedAt,lastSuccessAt:status.swimmers[memberId]?.lastSuccessAt || null,
      lastImportedAt:checkedAt,savedRows:histories[memberId].length,
      newestSwim:histories[memberId][0].date,
      note:'Verified in the signed-in Data Hub. Unattended API access remains separate.'
    };
  }
  // Validate the complete snapshot before writing either published file.
  await fs.writeFile(historyPath+'.tmp',JSON.stringify(histories,null,2)+'\n');
  await fs.rename(historyPath+'.tmp',historyPath);
  await fs.writeFile(statusPath,JSON.stringify({...status,status:'manual',checkedAt},null,2)+'\n');
  if (snapshot.profiles?.length) {
    roster.verifiedAt=checkedAt;
    roster.swimmers.sort((a,b)=>a.team.localeCompare(b.team)||a.name.localeCompare(b.name));
    await fs.writeFile(rosterPath,JSON.stringify(roster,null,2)+'\n');
  }
  if (!snapshot.discovery && snapshot.profiles?.length) {
    try {
      const progress=JSON.parse(await fs.readFile(path.join(directory,progressName),'utf8'));
      const profileKey=profile=>[profile.name.trim().toLowerCase(),profile.team,profile.division].join('|');
      const importedKeys=new Set(snapshot.profiles.map(profileKey));
      snapshot.discovery={...progress,status:'in-progress',pending:progress.pending.filter(profile=>!importedKeys.has(profileKey(profile)))};
    } catch(error) {if(error.code!=='ENOENT') throw error;}
  }
  if (snapshot.discovery && Array.isArray(snapshot.discovery.pending)) {
    const importStatus = snapshot.discovery.status === 'in-progress' ? 'in-progress' :
      snapshot.discovery.status === 'complete' && !snapshot.discovery.pending.length ? 'complete' : 'rate-limited';
    roster.importStatus=importStatus;
    roster.complete=importStatus==='complete';
    roster.pendingCandidates=snapshot.discovery.pending.length;
    if(pnsScope){
      roster.expansion={scope:`PN ages ${ageLabel} with current-age national A-or-faster times`,complete:false};
      roster.coverage='Includes existing saved swimmers and verified PN ages 9-14 additions with current-age national motivational A-or-faster times. Discovery is incomplete; not a certified membership roster.';
    }
    await fs.writeFile(rosterPath,JSON.stringify(roster,null,2)+'\n');
    await fs.writeFile(path.join(directory,progressName),JSON.stringify({
      checkedAt,status:importStatus,source:'USA Swimming Data Hub',
      season:'2026-2027',coverage:pnsScope?`PN swimmers currently ages ${ageLabel}, any team, with a national motivational A-or-faster best for current age. Incomplete discovery.`:'Individual SCY rankings, PN, ages at swim 11-12. Each profile requires current identity verification.',
      verifiedMemberIds:Object.keys(histories),pending:snapshot.discovery.pending,
      ...(pnsScope?{scope:snapshot.scope,discoveryComplete:false,pages:snapshot.discovery.pages||[],screened:snapshot.discovery.screened||[]}: {})
    },null,2)+'\n');
  }
  return imported;
}

function serve(port = 5191) {
  const token = crypto.randomBytes(32).toString('hex');
  const server = http.createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self'; frame-ancestors 'none'");
    // The server binds only to 127.0.0.1 below; this queue never leaves the local machine.
    if (req.method === 'GET' && req.url === '/known-younger') {
      try {
        const roster=JSON.parse(await fs.readFile(path.join(root,'swimmer-roster.json'),'utf8'));
        res.setHeader('Content-Type','application/json; charset=utf-8');
        res.end(JSON.stringify(roster.swimmers.filter(sw=>['9','10'].includes(sw.ageGroup))
          .map(({name,team,division,usaSwimmingMemberId})=>({name,team,division,usaSwimmingMemberId}))));
      }catch(error){res.writeHead(500);res.end('The saved younger roster could not be read.');}
      return;
    }
    if (req.method === 'GET' && ['/queue','/queue-pns','/queue-pns-younger'].includes(req.url)) {
      try {
        const progress=await fs.readFile(path.join(root,req.url==='/queue-pns-younger'?'pns-a-9-10-import-progress.json':req.url==='/queue-pns'?'pns-a-import-progress.json':'roster-import-progress.json'),'utf8');
        res.setHeader('Content-Type','application/json; charset=utf-8');res.end(progress);
      }catch(error){res.writeHead(500);res.end('The saved import queue could not be read.');}
      return;
    }
    if (req.method === 'GET' && req.url === '/') {
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(`<!doctype html><title>LaneLine Data Hub Import</title><h1>Data Hub Import</h1><form method="post" action="/import"><input type="hidden" name="token" value="${token}"><label for="snapshot">Verified swim snapshot</label><textarea id="snapshot" name="snapshot" rows="16" cols="80"></textarea><button type="submit">Import verified swims</button></form>`);
      return;
    }
    if (req.method !== 'POST' || req.url !== '/import') {res.writeHead(404);res.end();return;}
    if (req.headers.origin !== `http://localhost:${port}` && req.headers.origin !== `http://127.0.0.1:${port}`) {
      res.writeHead(403);res.end('Local origin required.');return;
    }
    let body='';
    try {
      for await (const chunk of req) {
        body+=chunk;
        if (body.length>16_000_000) throw new Error('Snapshot is too large.');
      }
      const form = new URLSearchParams(body);
      if (form.get('token') !== token) {res.writeHead(403);res.end('Invalid token.');return;}
      const result = await importSnapshot(JSON.parse(form.get('snapshot')));
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({status:'imported',swimmers:result},null,2));
    } catch(error) {res.writeHead(400,{'Content-Type':'text/plain'});res.end(error.message);}
  });
  server.listen(port,'127.0.0.1',()=>console.log(`Local import: http://localhost:${port}`));
  return server;
}

module.exports = {importSnapshot};
if (require.main === module) serve(Number(process.argv[2] || 5191));
