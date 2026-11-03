(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./standards-engine'),require('./insights-engine'));
  else root.LaneLineRelays=factory(root.LaneLineStandards,root.LaneLineInsights);
})(typeof globalThis==='object'?globalThis:this,function(S,I){
  const events=[
    {id:'200-free',label:'200 Free Relay',distance:50,strokes:['Free','Free','Free','Free']},
    {id:'400-free',label:'400 Free Relay',distance:100,strokes:['Free','Free','Free','Free']},
    {id:'800-free',label:'800 Free Relay',distance:200,strokes:['Free','Free','Free','Free']},
    {id:'200-medley',label:'200 Medley Relay',distance:50,strokes:['Back','Breast','Fly','Free']},
    {id:'400-medley',label:'400 Medley Relay',distance:100,strokes:['Back','Breast','Fly','Free']}
  ];
  function format(cs){const minutes=Math.floor(cs/6000),seconds=Math.floor(cs%6000/100),fraction=String(cs%100).padStart(2,'0');return minutes?minutes+':'+String(seconds).padStart(2,'0')+'.'+fraction:seconds+'.'+fraction;}
  function predict(swimmers,{age,course,division,event}){
    const spec=events.find(e=>e.id===event),bounds=S.ageBounds(age);
    if(!spec||!bounds||!['SCY','LCM'].includes(course)||!['boys','girls','mixed'].includes(division))return [];
    const teams=new Map(),seen=new Set();
    for(const sw of swimmers){
      const id=sw.usaSwimmingMemberId||sw.id,n=Number(sw.ageGroup),team=String(sw.team||'').trim();
      if(sw.activePns===false||!id||seen.has(id)||!team||/^(unattached|un|unknown)$/i.test(team)||!['boys','girls'].includes(sw.division)||!Number.isFinite(n)||n<bounds[0]||n>bounds[1]||(sw.lsc&&sw.lsc!=='PN')||(division!=='mixed'&&sw.division!==division))continue;
      seen.add(id);
      const rows=I.bestRows(sw,course),legs=spec.strokes.map(stroke=>rows.find(r=>S.eventKey(r.event)===S.eventKey(spec.distance+' '+stroke+' '+course)));
      if(!teams.has(team))teams.set(team,[]);
      teams.get(team).push({id,name:sw.name,division:sw.division,legs});
    }
    const results=[];
    for(const [team,athletes] of teams){
      let remaining=athletes;
      for(const squad of ['A','B','C']){
      // Process each athlete once; mask states assign that athlete to at most one leg.
      let dp=new Map([['0|0',{mask:0,boys:0,total:0,lineup:Array(4).fill(null)}]]);
      for(const athlete of remaining){
        const next=new Map(dp);
        for(const state of dp.values())for(let leg=0;leg<4;leg++){
          const row=athlete.legs[leg],time=S.centiseconds(row?.time);
          if(state.mask&(1<<leg)||!Number.isFinite(time)||time<=0)continue;
          const mask=state.mask|(1<<leg),boys=state.boys+(division==='mixed'&&athlete.division==='boys'?1:0);
          const count=mask.toString(2).replace(/0/g,'').length;
          if(division==='mixed'&&(boys>2||count-boys>2))continue;
          const total=state.total+time,key=mask+'|'+boys,previous=next.get(key);
          if(previous&&previous.total<=total)continue;
          const lineup=state.lineup.slice();
          lineup[leg]={id:athlete.id,name:athlete.name,division:athlete.division,stroke:spec.strokes[leg],distance:spec.distance,time:row.time,meet:row.meet||'',date:row.date||''};
          next.set(key,{mask,boys,total,lineup});
        }
        dp=next;
      }
      const best=dp.get('15|'+(division==='mixed'?2:0));
      results.push({team,squad,eligible:remaining.length,complete:Boolean(best),total:best?.total??null,time:best?format(best.total):null,lineup:best?.lineup||[]});
      if(best){const used=new Set(best.lineup.map(leg=>leg.id));remaining=remaining.filter(athlete=>!used.has(athlete.id));}
      }
    }
    results.sort((a,b)=>Number(b.complete)-Number(a.complete)||(a.total??Infinity)-(b.total??Infinity)||a.team.localeCompare(b.team)||a.squad.localeCompare(b.squad));
    let last=null,rank=0;
    return results.map((r,i)=>{if(r.complete&&r.total!==last){rank=i+1;last=r.total;}return {...r,rank:r.complete?rank:null};});
  }
  function boards(swimmers,course){const result={};for(const age of ['11-12','13-14'])for(const division of ['boys','girls','mixed'])for(const event of events)result[[age,division,event.id].join('|')]=predict(swimmers,{age,division,event:event.id,course});return result;}
  return {events,predict,boards,format};
});
