const fs=require('node:fs/promises');
const path=require('node:path');
const vm=require('node:vm');
const S=require('../standards-engine');
const root=path.resolve(__dirname,'..');
const nameKey=name=>String(name||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function raceKey(row){
  const date=new Date(row.date),time=S.centiseconds(row.time);
  if(!Number.isFinite(date.getTime())||!Number.isFinite(time))return null;
  const event=S.eventKey(row.event+(/\b(SCY|LCM|SCM)\b/i.test(row.event)?'':' '+row.course));
  return [event,time,date.toISOString().slice(0,10)].join('|');
}
function audit(roster,source,standards,histories,checks=[]){
  const names=new Set(roster.swimmers.map(sw=>nameKey(sw.name))),knownIds=new Set(Object.keys(histories));
  const candidates=new Map();
  for(const sw of source.swimmers||[]){
    if(sw.age<9||sw.age>14||names.has(nameKey(sw.name))||knownIds.has(String(sw.personKey))||checks.some(check=>check.outcome!=='needs-identity-review'&&check.division===(sw.gender==='F'?'girls':'boys')&&([check.name,check.candidateName].some(name=>name&&nameKey(name)===nameKey(sw.name))||check.usaSwimmingMemberId===String(sw.personKey))))continue;
    const division=sw.gender==='F'?'girls':'boys';
    const qualifies=(sw.swims||[]).some(row=>{
      const cut=S.motivationalCuts(standards,row.event+' '+row.course,{division,ageGroup:String(sw.age)})?.A;
      return cut&&S.centiseconds(row.time)<=S.centiseconds(cut);
    });
    if(!qualifies)continue;
    const key=nameKey(sw.name)+'|'+division;
    const candidate=candidates.get(key)||{name:sw.name,division,sourceAge:sw.age,sourceTeams:[],sourceIds:[],status:'needs-current-profile-verification'};
    if(!candidate.sourceTeams.includes(sw.team))candidate.sourceTeams.push(sw.team);
    if(!candidate.sourceIds.includes(sw.personKey))candidate.sourceIds.push(sw.personKey);
    const parts=String(sw.name).toLowerCase().split(/\s+/);
    candidate.possibleNameMatches=roster.swimmers.filter(p=>{const other=p.name.toLowerCase().split(/\s+/);return parts[0]===other[0]&&parts.at(-1)===other.at(-1);}).map(p=>({name:p.name,id:p.usaSwimmingMemberId}));
    candidates.set(key,candidate);
  }
  const sourceById=new Map((source.swimmers||[]).map(sw=>[String(sw.personKey),sw]));
  const indexedHistories=new Map(),linkedAliases=[],pending=[];
  for(const candidate of candidates.values()){
    const sourceKeys=new Set(candidate.sourceIds.flatMap(id=>(sourceById.get(String(id))?.swims||[]).map(raceKey)).filter(Boolean));
    const matches=candidate.possibleNameMatches.map(profile=>{
      if(!indexedHistories.has(profile.id))indexedHistories.set(profile.id,new Set((histories[profile.id]||[]).map(raceKey).filter(Boolean)));
      const keys=[...sourceKeys].filter(key=>indexedHistories.get(profile.id).has(key));
      return {...profile,keys};
    }).filter(match=>new Set(match.keys.map(key=>key.split('|')[0])).size>=2);
    if(matches.length===1)linkedAliases.push({candidateName:candidate.name,name:matches[0].name,usaSwimmingMemberId:matches[0].id,matchingRaceRows:matches[0].keys.length,status:'linked-existing-history',note:'Same first and last names plus exact date/time matches in at least two different events. Not a new live age or team verification.'});
    else pending.push(candidate);
  }
  return {checkedAt:new Date().toISOString(),complete:false,sourceUpdatedAt:source.lastUpdated,
    scope:'PNS ages 9-14, current-age national A or faster. Historical source candidates require live identity, age, team and eligibility checks.',
    savedProfiles:roster.swimmers.length,totalSavedSwimmers:new Set([...roster.swimmers.map(p=>p.usaSwimmingMemberId),...Object.keys(histories)]).size,savedRaceRows:Object.values(histories).reduce((sum,rows)=>sum+rows.length,0),
    liveVerificationResults:checks,
    linkedAliases,
    discoveryCandidates:pending.sort((a,b)=>a.name.localeCompare(b.name)),
    existingProfilesToRecheck:[...roster.swimmers.filter(p=>!checks.some(check=>check.outcome!=='needs-identity-review'&&check.usaSwimmingMemberId===p.usaSwimmingMemberId)).map(p=>({name:p.name,id:p.usaSwimmingMemberId,age:p.ageGroup,team:p.team,status:'pending-live-recheck'})),
      ...Object.keys(histories).filter(id=>!roster.swimmers.some(p=>p.usaSwimmingMemberId===id)&&!checks.some(check=>check.outcome!=='needs-identity-review'&&check.usaSwimmingMemberId===id)).map(id=>({id,status:'pending-live-recheck',note:'Seeded app profile; identity must be read from its live Data Hub page.'}))]};
}
async function main(){
  const read=async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
  const roster=await read('swimmer-roster.json');
  const html=await fs.readFile(path.join(root,'index.html'),'utf8');
  const start=html.indexOf('const ethanWangUsaSwimmingProfile ='),end=html.indexOf('function orderedSwimmers(');
  if(start<0||end<start)throw new Error('Seeded profile declarations not found; audit stopped.');
  const seeds=vm.runInNewContext(html.slice(start,end)+';seededUsaSwimmingProfiles',{}, {timeout:1000});
  const known=new Set(roster.swimmers.map(sw=>sw.usaSwimmingMemberId));
  const completeRoster={...roster,swimmers:[...roster.swimmers,...seeds.filter(sw=>!known.has(sw.usaSwimmingMemberId))]};
  const result=audit(completeRoster,await read('western-zone-dashboard/data/swimmers.json'),await read('time-standards.json'),await read('datahub-history.json'),await read('roster-recheck-results.json'));
  await fs.writeFile(path.join(root,'roster-coverage-audit.json'),JSON.stringify(result,null,2)+'\n');
  roster.complete=false;roster.pendingCandidates=result.discoveryCandidates.length;
  roster.coverageAudit='roster-coverage-audit.json';
  await fs.writeFile(path.join(root,'swimmer-roster.json'),JSON.stringify(roster,null,2)+'\n');
  console.log(JSON.stringify({savedProfiles:result.savedProfiles,candidates:result.discoveryCandidates.length,linkedAliases:result.linkedAliases.length,possibleAliases:result.discoveryCandidates.filter(p=>p.possibleNameMatches.length).length,sourceUpdatedAt:result.sourceUpdatedAt}));
}
module.exports={audit};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
