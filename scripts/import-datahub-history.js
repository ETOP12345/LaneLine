const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { mergeRows } = require('./refresh-swimmer-history');

const root = path.resolve(__dirname, '..');

async function importSnapshot(snapshot, directory = root) {
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
        !['11','12'].includes(profile.ageGroup) || !['girls','boys'].includes(profile.division) ||
        !['Bellevue Club Swim Team','Wave Aquatics','Pacific Dragons Swim Team'].includes(profile.team) ||
        !Array.isArray(snapshot.swimmers[id]) || !snapshot.swimmers[id].length) {
      throw new Error('New profiles must be verified 11-12 swimmers on BCST, WAVE, or PDST with race history.');
    }
    const clean={id:'usas_'+id,name:profile.name,ageGroup:profile.ageGroup,division:profile.division,
      team:profile.team,usaSwimmingMemberId:id,bestTimes:[]};
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
  if (snapshot.discovery && Array.isArray(snapshot.discovery.pending)) {
    await fs.writeFile(path.join(directory,'roster-import-progress.json'),JSON.stringify({
      checkedAt,status:'rate-limited',source:'USA Swimming Data Hub',
      season:'2026-2027',coverage:'Individual SCY rankings, PN, ages at swim 11-12. Each profile requires current identity verification.',
      verifiedMemberIds:Object.keys(histories),pending:snapshot.discovery.pending
    },null,2)+'\n');
  }
  return imported;
}

function serve(port = 5191) {
  const token = crypto.randomBytes(32).toString('hex');
  const server = http.createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self'; frame-ancestors 'none'");
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
