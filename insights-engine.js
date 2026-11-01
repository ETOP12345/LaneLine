(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory(require('./standards-engine.js'));
  else root.LaneLineInsights=factory(root.LaneLineStandards);
})(typeof globalThis==='object'?globalThis:this,function(S){
  function bestRows(sw,course){
    const rows=new Map();
    for(const row of sw.bestTimes||[]){
      const key=S.eventKey(row.event),time=S.centiseconds(row.time);
      if(!key.endsWith(' '+course.toLowerCase())||!Number.isFinite(time)||time<=0) continue;
      if(!rows.has(key)||time<S.centiseconds(rows.get(key).time)) rows.set(key,row);
    }
    return [...rows.values()];
  }
  function strengths(sw,swimmers,course,data){
    return bestRows(sw,course).map(row=>{
      const key=S.eventKey(row.event),time=S.centiseconds(row.time);
      const seen=new Set([sw.usaSwimmingMemberId||sw.id]);
      const population=swimmers.filter(p=>{const id=p.usaSwimmingMemberId||p.id;if(!id||seen.has(id)||p.division!==sw.division)return false;seen.add(id);return true;});
      const eventPeers=population.map(p=>({age:Number(p.ageGroup),row:bestRows(p,course).find(r=>S.eventKey(r.event)===key)})).filter(p=>p.row);
      const peers=eventPeers.filter(p=>p.age===Number(sw.ageGroup)).map(p=>p.row);
      const older=eventPeers.filter(p=>p.age>=13&&p.age<=14).map(p=>p.row);
      const faster=peers.filter(p=>S.centiseconds(p.time)<time).length;
      const tied=peers.filter(p=>S.centiseconds(p.time)===time).length;
      const cuts=S.motivationalCuts(data,row.event,sw),levels=['AAAA','AAA','AA','A','BB','B'];
      const level=cuts?(levels.find(l=>time<=S.centiseconds(cuts[l]))||'Below B'):'N/A';
      const ratio=cuts?S.centiseconds(cuts.AAAA)/time:null;
      const olderRank=older.filter(p=>S.centiseconds(p.time)<time).length+1;
      return {row,level,ratio,rank:faster+1,total:peers.length+1,tied,olderRank,olderTotal:older.length+1,
        peerScore:peers.length?1-faster/peers.length:null};
    }).sort(comparePeerStrength);
  }
  function comparePeerStrength(a,b){
    return Number(a.total<2)-Number(b.total<2)||a.rank-b.rank||
      Number(a.olderTotal<2)-Number(b.olderTotal<2)||a.olderRank-b.olderRank||
      (b.ratio??0)-(a.ratio??0)||String(a.row.event).localeCompare(String(b.row.event));
  }
  function signatureEvents(rows){
    const rated=rows.filter(r=>r.total>=2).slice().sort(comparePeerStrength);
    if(!rated.length)return [];
    return rated.filter(r=>r.rank===rated[0].rank).slice(0,2);
  }
  function archetype(rows){
    const strokes=[['breast','Breaststroke','#68737d'],['im','Individual medley','#252b36'],['free','Freestyle','#263c79'],['fly','Butterfly','#3897de'],['back','Backstroke','#087b98']];
    const groups=strokes.map(([key,label,color])=>{
      const events=rows.filter(r=>Number.isFinite(r.ratio)&&r.ratio>0&&S.eventKey(r.row.event).split(' ')[1]===key).sort((a,b)=>b.ratio-a.ratio);
      return {key,label,color,best:events[0]||null,count:events.length};
    });
    const ranked=groups.filter(g=>g.best).sort((a,b)=>b.best.ratio-a.best.ratio);
    if(!ranked.length) return {groups:[],label:'Not enough standard-rated times',provisional:true};
    const top=ranked[0].best.ratio;
    // Softmax emphasizes relative strengths without rewarding the number of events swum.
    const total=ranked.reduce((sum,g)=>sum+Math.exp((g.best.ratio-top)/0.06),0);
    for(const group of groups) group.share=group.best?Math.exp((group.best.ratio-top)/0.06)/total:0;
    const close=ranked.filter(g=>g.best.ratio>=top*0.97);
    const label=ranked.length<3?'Emerging '+ranked[0].label:
      close.length>=3?'All-Round Swimmer':close.length===2?'Dual '+close.map(g=>g.label).join(' / '):'Specialized '+ranked[0].label;
    return {groups,label,provisional:ranked.length<3};
  }
  function yearlyArchetypes(sw,course,data){
    const years=new Map(),seen=new Set();
    for(const row of [...(sw.timeHistory||[]),...(sw.bestTimes||[])]){
      const raw=String(row.date||'').trim();
      if(!/\b\d{4}\b/.test(raw)||/^\d{4}$/.test(raw))continue;
      const date=new Date(raw),time=S.centiseconds(row.time),event=S.eventKey(row.event);
      if(!Number.isFinite(date.getTime())||!Number.isFinite(time)||!event.endsWith(' '+course.toLowerCase()))continue;
      const year=/^\d{4}-/.test(raw)?Number(raw.slice(0,4)):date.getFullYear();
      const key=[event,time,date.toISOString().slice(0,10),row.meet||''].join('|');
      if(seen.has(key))continue;seen.add(key);
      if(!years.has(year))years.set(year,[]);
      years.get(year).push(row);
    }
    return [...years.entries()].sort((a,b)=>b[0]-a[0]).map(([year,races])=>{
      const rated=strengths({...sw,bestTimes:races},[],course,data);
      return {...archetype(rated),year,raceCount:races.length,eventCount:rated.length};
    });
  }
  function eventComparison(sw,swimmers,event,course){
    const key=S.eventKey(event),self=bestRows(sw,course).find(r=>S.eventKey(r.event)===key);
    if(!self)return null;
    const selfTime=S.centiseconds(self.time),seen=new Set(),rows=[];
    for(const peer of [sw,...swimmers]){
      const identity=peer.usaSwimmingMemberId||peer.id;
      if(!identity||seen.has(identity)||peer.division!==sw.division||String(peer.ageGroup)!==String(sw.ageGroup))continue;
      seen.add(identity);
      const row=bestRows(peer,course).find(r=>S.eventKey(r.event)===key);if(!row)continue;
      const time=S.centiseconds(row.time),isSelf=identity===(sw.usaSwimmingMemberId||sw.id);
      rows.push({id:identity,name:peer.name,team:peer.team||'',row,isSelf,
        status:isSelf?'you':time<selfTime?'ahead':time>selfTime?'behind':'tied',
        gapSeconds:Math.abs(time-selfTime)/100,pace:selfTime/time*100,centiseconds:time});
    }
    rows.sort((a,b)=>a.centiseconds-b.centiseconds||String(a.name).localeCompare(String(b.name)));
    return {rows,rank:rows.filter(r=>r.centiseconds<selfTime).length+1,
      ahead:rows.filter(r=>r.status==='ahead').length,behind:rows.filter(r=>r.status==='behind').length,
      tied:rows.filter(r=>r.status==='tied').length};
  }
  function goalProgress(goal,current){
    const now=S.centiseconds(current),start=S.centiseconds(goal.baseline),target=S.centiseconds(goal.cut);
    if(![now,start,target].every(Number.isFinite)||start<=target) return null;
    return {met:now<=target,drop:Math.max(0,now-target)/100,progress:Math.max(0,Math.min(100,(start-now)/(start-target)*100))};
  }
  return {bestRows,strengths,comparePeerStrength,signatureEvents,archetype,yearlyArchetypes,eventComparison,goalProgress};
});
