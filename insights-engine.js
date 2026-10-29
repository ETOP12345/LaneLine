(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory(require('./standards-engine.js'));
  else root.LaneLineInsights=factory(root.LaneLineStandards);
})(typeof globalThis==='object'?globalThis:this,function(S){
  function bestRows(sw,course){
    const rows=new Map();
    for(const row of sw.bestTimes||[]){
      const key=S.eventKey(row.event),time=S.centiseconds(row.time);
      if(!key.endsWith(' '+course.toLowerCase())||!Number.isFinite(time)) continue;
      if(!rows.has(key)||time<S.centiseconds(rows.get(key).time)) rows.set(key,row);
    }
    return [...rows.values()];
  }
  function strengths(sw,swimmers,course,data){
    return bestRows(sw,course).map(row=>{
      const key=S.eventKey(row.event),time=S.centiseconds(row.time);
      const peers=swimmers.filter(p=>p.id!==sw.id&&p.division===sw.division&&String(p.ageGroup)===String(sw.ageGroup))
        .map(p=>bestRows(p,course).find(r=>S.eventKey(r.event)===key)).filter(Boolean);
      const faster=peers.filter(p=>S.centiseconds(p.time)<time).length;
      const tied=peers.filter(p=>S.centiseconds(p.time)===time).length;
      const cuts=S.motivationalCuts(data,row.event,sw),levels=['AAAA','AAA','AA','A','BB','B'];
      const level=cuts?(levels.find(l=>time<=S.centiseconds(cuts[l]))||'Below B'):'N/A';
      const ratio=cuts?S.centiseconds(cuts.AAAA)/time:null;
      return {row,level,ratio,rank:faster+1,total:peers.length+1,tied};
    }).sort((a,b)=>(b.ratio??0)-(a.ratio??0));
  }
  function goalProgress(goal,current){
    const now=S.centiseconds(current),start=S.centiseconds(goal.baseline),target=S.centiseconds(goal.cut);
    if(![now,start,target].every(Number.isFinite)||start<=target) return null;
    return {met:now<=target,drop:Math.max(0,now-target)/100,progress:Math.max(0,Math.min(100,(start-now)/(start-target)*100))};
  }
  return {bestRows,strengths,goalProgress};
});
