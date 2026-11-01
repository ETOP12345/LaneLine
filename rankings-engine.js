(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./standards-engine'),require('./insights-engine'));
  else root.LaneLineRankings=factory(root.LaneLineStandards,root.LaneLineInsights);
})(typeof globalThis==='object'?globalThis:this,function(S,I){
  function rank(swimmers,options,data){
    const [min,max]=options.age.split('-').map(Number),seen=new Set(),entries=[];
    for(const sw of swimmers){
      const id=sw.usaSwimmingMemberId||sw.id,age=Number(sw.ageGroup);
      if(!id||seen.has(id)||!Number.isFinite(age)||age<min||age>max||sw.division!==options.division||(sw.lsc&&sw.lsc!=='PN'))continue;
      seen.add(id);
      const events=I.bestRows(sw,options.course).map(row=>{
        // Use the same age-group benchmark for every swimmer on the board.
        const cuts=S.motivationalCuts(data,row.event,{...sw,ageGroup:String(max)});
        const time=S.centiseconds(row.time),cut=S.centiseconds(cuts?.AAAA);
        return {row,time,index:Number.isFinite(cut)&&cut>0?cut/time*100:null};
      }).sort((a,b)=>(b.index??-1)-(a.index??-1)||a.time-b.time);
      const selected=options.event?events.find(e=>S.eventKey(e.row.event)===options.event):null;
      const rated=events.filter(e=>e.index!==null).slice(0,3);
      if(options.event?!selected:rated.length<3)continue;
      entries.push({sw,events,time:selected?.time,selected,score:options.event?null:rated.reduce((s,e)=>s+e.index,0)/3});
    }
    entries.sort((a,b)=>options.event?a.time-b.time||a.sw.name.localeCompare(b.sw.name):b.score-a.score||a.sw.name.localeCompare(b.sw.name));
    let previous=null,place=0;
    return entries.map((entry,i)=>{const value=options.event?entry.time:entry.score;if(value!==previous)place=i+1;previous=value;return {...entry,rank:place};});
  }
  return {rank};
});
