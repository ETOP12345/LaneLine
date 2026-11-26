const fs=require('node:fs');
const path=require('node:path');
const S=require('../standards-engine');

function candidates(profiles,histories,data){
  const entries=profiles.filter(s=>s.activePns!==false&&(!s.lsc||s.lsc==='PN')).map(profile=>{
    const best=new Map();
    for(const row of [...(profile.bestTimes||[]),...(histories[profile.usaSwimmingMemberId]||[])]){
      const key=S.eventKey(row.event),time=S.centiseconds(row.time);
      if(!(time>0)||!S.motivationalCuts(data,row.event,profile))continue;
      if(!best.has(key)||time<best.get(key).time)best.set(key,{row,time});
    }
    return {profile,best,reasons:[]};
  });
  const boards=new Map();
  for(const entry of entries){
    for(const [event,{row,time}] of entry.best){
      const cut=S.centiseconds(S.motivationalCuts(data,row.event,entry.profile)?.AA);
      if(time<=cut&&!entry.reasons.includes('AA or faster'))entry.reasons.push('AA or faster');
      const key=[entry.profile.division,S.groupFor(entry.profile.ageGroup),event].join('|');
      if(!boards.has(key))boards.set(key,[]);
      boards.get(key).push({entry,time,event});
    }
  }
  for(const board of boards.values()){
    board.sort((a,b)=>a.time-b.time);
    let rank=0,previous;
    board.forEach((item,i)=>{if(item.time!==previous)rank=i+1;previous=item.time;if(rank<=5)item.entry.reasons.push('Saved PNS #'+rank+' '+item.event);});
  }
  return entries.filter(e=>e.reasons.some(reason=>reason.startsWith('Saved PNS #'))).map(e=>({memberId:e.profile.usaSwimmingMemberId,name:e.profile.name,ageGroup:e.profile.ageGroup,division:e.profile.division,team:e.profile.team,lsc:e.profile.lsc||'PN',reasons:e.reasons}));
}

function update(root=path.resolve(__dirname,'..')){
  const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  const profiles=read('swimmer-roster.json').swimmers.slice();
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const match of html.matchAll(/const \w+UsaSwimmingProfile = \{([\s\S]*?)bestTimes:/g)){
    const profile={};
    for(const field of ['name','ageGroup','division','team','usaSwimmingMemberId'])profile[field]=match[1].match(new RegExp(field+": '([^']*)'"))?.[1];
    if(profile.usaSwimmingMemberId&&!profiles.some(s=>s.usaSwimmingMemberId===profile.usaSwimmingMemberId))profiles.push(profile);
  }
  const history=read('datahub-history.json'),status=read('datahub-refresh-status.json').swimmers;
  const eligible=candidates(profiles,history,read('time-standards.json'));
  const queuePath=path.join(root,'browser-refresh-progress.json');
  const prior=fs.existsSync(queuePath)?read('browser-refresh-progress.json'):{startedAt:new Date().toISOString()};
  const checked=eligible.filter(e=>status[e.memberId]?.lastImportedAt>=prior.startedAt).map(e=>({...e,checkedAt:status[e.memberId].lastImportedAt,mode:status[e.memberId].mode||'full-history'}));
  const checkedIds=new Set(checked.map(e=>e.memberId));
  const pending=eligible.filter(e=>!checkedIds.has(e.memberId)).sort((a,b)=>Number(b.reasons.includes('AA or faster'))-Number(a.reasons.includes('AA or faster'))||(status[a.memberId]?.lastImportedAt||'').localeCompare(status[b.memberId]?.lastImportedAt||'')||a.name.localeCompare(b.name));
  const queue={...prior,scope:'Top 5, including ties, in any published event in saved PNS age-group rankings; AA alone does not qualify; incomplete ranking coverage',total:eligible.length,checked,pending:pending.map(e=>e.memberId),candidates:pending,status:pending.length?'in-progress':'complete'};
  fs.writeFileSync(queuePath,JSON.stringify(queue,null,2)+'\n');
  return {total:queue.total,checked:checked.length,pending:pending.length,next:pending.slice(0,4)};
}
module.exports={candidates,update};
if(require.main===module)console.log(JSON.stringify(update(),null,2));
