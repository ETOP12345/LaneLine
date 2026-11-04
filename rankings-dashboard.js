(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./rankings-engine'),require('./standards-engine'),require('./insights-engine'),require('./relay-engine'));
  else root.LaneLineRankingDashboard=factory(root.LaneLineRankings,root.LaneLineStandards,root.LaneLineInsights,root.LaneLineRelays);
})(typeof globalThis==='object'?globalThis:this,function(R,S,I,Relays){
  function powerPoints(row){
    const value=row.powerPoints??row.pp;
    return value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
  }
  function data(swimmers,standards,course,{includeRelays=true}={}){
    const groups={},eventOrder=new Set();
    for(const age of ['11-12','13-14'])for(const [gender,division] of [['M','boys'],['F','girls']]){
      const [min,max]=age.split('-').map(Number),seen=new Set();
      const allowed=new Set(['50 Free','100 Free','200 Free',course==='SCY'?'500 Free':'400 Free','50 Back','100 Back','200 Back','50 Breast','100 Breast','200 Breast','50 Fly','100 Fly','200 Fly','200 IM','400 IM',...(course==='SCY'?['100 IM']:[])]);
      const entries=swimmers.filter(sw=>{
        const id=sw.usaSwimmingMemberId||sw.id,n=Number(sw.ageGroup);
        if(sw.activePns===false||!id||seen.has(id)||!Number.isFinite(n)||n<min||n>max||sw.division!==division||(sw.lsc&&sw.lsc!=='PN'))return false;
        seen.add(id);return true;
      }).map(sw=>({sw,events:I.bestRows(sw,course).filter(row=>allowed.has(row.event.replace(/ (SCY|LCM)$/i,''))).map(row=>({row,time:S.centiseconds(row.time)}))})).filter(e=>e.events.length);
      const eventRanks=new Map();
      for(const entry of entries)for(const event of entry.events){
        const key=S.eventKey(event.row.event);
        if(!eventRanks.has(key))eventRanks.set(key,[]);
        eventRanks.get(key).push(event.time);
      }
      for(const [key,times] of eventRanks){
        times.sort((a,b)=>a-b);
        const ranks=new Map();
        times.forEach((time,index)=>{if(!ranks.has(time))ranks.set(time,index+1);});
        eventRanks.set(key,ranks);
      }
      const rows=entries.map(entry=>{
        const compact=e=>{
          const event=e.row.event.replace(/ (SCY|LCM)$/i,''),cuts=S.motivationalCuts(standards,e.row.event,entry.sw);
          eventOrder.add(event);
          return {event,rank:eventRanks.get(S.eventKey(e.row.event)).get(e.time),
            swim:{event,course,time:e.row.time,date:e.row.date,meet:e.row.meet,pp:powerPoints(e.row),std:cuts?['AAAA','AAA','AA','A','BB','B'].find(l=>e.time<=S.centiseconds(cuts[l]))||'Below B':'N/A'}};
        };
        const events=entry.events.map(compact).sort((a,b)=>a.rank-b.rank||a.event.localeCompare(b.event)),cuts={lcmAAA:0,scyAAA:0},ties=[];
        for(const c of ['LCM','SCY'])for(const row of I.bestRows(entry.sw,c)){
          const cut=S.motivationalCuts(standards,row.event,entry.sw)?.AAA;
          if(cut&&S.centiseconds(row.time)<=S.centiseconds(cut)){
            cuts[c==='LCM'?'lcmAAA':'scyAAA']++;
            ties.push({type:'AAA or faster',swim:{event:row.event,course:c,time:row.time,date:row.date,meet:row.meet,pp:'unavailable',std:'AAA or faster'}});
          }
        }
        const topSix=events.slice(0,6),complete=topSix.length===6;
        const pp=topSix.every(e=>e.swim.pp!==null)?topSix.reduce((sum,e)=>sum+e.swim.pp,0):null;
        return {name:entry.sw.name,team:entry.sw.team,age:Number(entry.sw.ageGroup),gender,ageGroup:age,
          score:(complete?0:999)+topSix.reduce((sum,e)=>sum+e.rank,0),pp:pp??'unavailable',cuts,complete,
          events,topSix,ties};
      });
      const tieKey=r=>[r.complete,r.score,r.cuts.lcmAAA,r.cuts.scyAAA].join('|'),buckets=new Map();
      for(const row of rows){const key=tieKey(row);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(row);}
      const completePoints=new Set([...buckets].filter(([,rows])=>rows.every(r=>typeof r.pp==='number')).map(([key])=>key));
      const compare=(a,b)=>Number(b.complete)-Number(a.complete)||a.score-b.score||b.cuts.lcmAAA-a.cuts.lcmAAA||b.cuts.scyAAA-a.cuts.scyAAA||
        (completePoints.has(tieKey(a))?b.pp-a.pp:0);
      rows.sort((a,b)=>compare(a,b)||a.name.localeCompare(b.name));
      rows.forEach((r,i)=>{r.rank=i&&compare(rows[i-1],r)===0?rows[i-1].rank:i+1;r.status=r.rank<=12?'Top 12':r.rank<=14?'Top 14':'Ranked';r.previousRank=r.rank;r.rankDelta=0;});
      groups[age+'|'+gender]=rows;
    }
    return {source:'LaneLine saved PNS race histories (incomplete coverage)',lastUpdated:null,lastLoadedAt:new Date().toISOString(),
      generatedAt:new Date().toISOString(),ageGroups:['11-12','13-14'],defaultAgeGroup:'11-12',defaultGender:'M',
      genders:[{value:'M',label:'Male'},{value:'F',label:'Female'}],eventOrder:[...eventOrder],groups,rankChanges:{},course,relays:includeRelays?Relays.boards(swimmers,course):{},relaysPending:!includeRelays,relayEvents:Relays.events};
  }
  function shell(html){
    const empty={groups:{},ageGroups:['11-12','13-14'],genders:[{value:'M',label:'Male'},{value:'F',label:'Female'}],defaultAgeGroup:'11-12',defaultGender:'M',eventOrder:[],source:'Waiting for LaneLine race histories'};
    html=html.replace(/const DATA=.*?;\r?\nconst LIMIT=50;/s,'const DATA='+JSON.stringify(empty)+';\nconst LIMIT=50;');
    html=html.replace(/<title>.*?<\/title>/,'<title>LaneLine Rankings</title>')
      .replace('Western Zone Ranking Dashboard','Rankings')
      .replace(/<section class="disclaimer">[\s\S]*?<\/section>/,'<section class="disclaimer"><strong>LaneLine rankings:</strong> Saved PNS swimmers only; coverage is incomplete. Score is the sum of the six best event ranks in the selected course (lower is better). Not official PNS rankings or team selection.<small id="disclaimerMeta"></small></section>')
      .replace(/<section class="rules-panel">[\s\S]*?<\/section>/,'<section class="rules-panel"><h2>Ranking method</h2><ul><li>Rank each event by personal-best time within the selected age group, division and course. Equal times share a rank.</li><li>Add each swimmer\'s six lowest event ranks. Lowest total wins; fewer than six events is incomplete and follows complete swimmers.</li><li>Ties: more distinct LCM AAA-or-faster events, then more SCY AAA-or-faster events, then higher actual top-six USA Swimming power-point total when available for everyone tied. Otherwise the rank stays tied; alphabetical order is display-only.</li><li>Scoring events follow the Zones event list; SCY uses 500 Free instead of 400 Free and also includes 100 IM. No Zones qualifying-date window is applied.</li><li>Top 12 and Top 14 indicate board positions, not team selection. No estimated power points are used.</li></ul></section>')
      .replace('<section class="controls">','<section class="controls"><div class="field"><label for="rankingCourse">Course</label><select id="rankingCourse"><option>SCY</option><option>LCM</option></select></div>')
      .replace('<nav class="tabs"','<nav id="rankingEventNav" class="ranking-event-nav" aria-label="Event rankings"></nav><nav class="tabs"')
      .replace('data-tab="teams">Teams</button>','data-tab="teams">Teams</button><button id="relaysTab" class="tab-button" type="button" data-tab="relays">Relay Predictor</button>')
      .replace('<section id="teamsView"','<section id="relaysView" class="view-panel"><div class="controls"><div class="field"><label for="relayDivision">Relay division</label><select id="relayDivision"><option value="boys">Boys</option><option value="girls">Girls</option><option value="mixed">Mixed (2 boys + 2 girls)</option></select></div><div class="field"><label for="relayEvent">Relay event</label><select id="relayEvent"></select></div></div><p class="muted">Fastest four distinct swimmers per team from all saved swimmers in the selected age group, not just the overall top 50. Medley order: back, breast, fly, free. Estimates sum individual best times without relay-start adjustments. Lineups are optimized separately for each relay. Meet eligibility, availability, age-up dates and entry limits are not verified. Missing times are never converted or guessed.</p><div id="relayResults"></div></section><section id="teamsView"')
      .replaceAll('r.score>=999','!r.complete')
      .replaceAll('window.scrollTo({top:0,behavior:"smooth"})','scrollRankingDetail()')
      .replaceAll('Zone Ranking Events','Ranked Events').replaceAll('this Zone ranking event','this event')
      .replaceAll('qualifying LCM time','saved time').replaceAll('LCM best times only','Selected course best times')
      .replace('+" · public"','').replaceAll("'+e.swim.pp+'","'+(e.swim.pp??'unavailable')+'");
    html=html.replace('Lineups are optimized separately for each relay.','A is the fastest lineup; B uses the remaining swimmers, and C uses those remaining after B. No swimmer appears twice in the same event. Different relay events are optimized independently.');
    html=html.replace('data-tab="teams">Teams</button>','data-tab="teams">Teams</button><button id="strokesTab" class="tab-button" type="button" data-tab="strokes">Strokes</button>')
      .replace('<section id="teamsView"','<section id="strokesView" class="view-panel"><div class="stroke-controls"><div class="field"><label for="rankingStroke">Stroke</label><select id="rankingStroke"><option value="Free">Freestyle</option><option value="Back">Backstroke</option><option value="Breast">Breaststroke</option><option value="Fly">Butterfly</option><option value="IM">Individual medley</option></select></div><nav id="strokeDistances" class="ranking-event-nav" aria-label="Stroke distances"></nav></div><section class="rank-panel"><div class="panel-head"><h2 id="strokeRankingTitle">Stroke rankings</h2><span id="strokeRankingCount"></span></div><div class="table-wrap"><table class="stroke-table"><thead><tr><th>Rank</th><th>Swimmer</th><th>Team</th><th>Best</th><th>National</th><th>Meet / Date</th></tr></thead><tbody id="strokeRankingBody"></tbody></table></div></section></section><section id="teamsView"');
    const bridge=`<style>.controls{grid-template-columns:130px 150px 140px minmax(220px,1fr)}.content-grid{grid-template-columns:minmax(0,1fr) 360px}table{min-width:700px}main{max-width:none}html,body{overflow:hidden}.ranking-event-nav{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}.ranking-event-nav button,.event-list .event-link{border:1px solid #92bce9;border-radius:6px;padding:7px 10px;background:#e9f3ff;color:#154f99;cursor:pointer}.ranking-event-nav button:hover,.event-list .event-link:hover{background:#d0e6ff;border-color:#2871c5}.ranking-event-nav button[aria-pressed="true"]{background:#175eae;color:#fff;border-color:#175eae}.ranking-event-nav button:focus-visible,.event-link:focus-visible{outline:3px solid #69aaff;outline-offset:2px}@media(max-width:1050px){.content-grid{grid-template-columns:1fr}}@media(max-width:700px){.controls{grid-template-columns:1fr 1fr}}</style><script>
function pill(e){return '<button class="pill event-link" data-event="'+esc(e.event)+'" title="'+esc(e.event+' #'+e.rank+' · '+e.swim.time+' · '+fmtDate(e.swim.date)+' · '+(e.swim.meet||'Meet unavailable'))+'"><span>'+esc(e.event)+'</span><strong>#'+e.rank+'</strong><span>'+esc(e.swim.time)+'</span></button>'}
function statusClass(s){return s==='Top 12'?'selected':s==='Top 14'?'alternate':'outside'}
function reportHeight(){parent.postMessage({type:'laneline-ranking-height',height:Math.ceil(document.body.getBoundingClientRect().height)},location.origin)}
function renderEventNav(){document.getElementById('rankingEventNav').innerHTML=DATA.eventOrder.map(event=>'<button type="button" data-event="'+esc(event)+'" aria-pressed="'+(state.detail.type==='event'&&state.detail.event===event)+'">'+esc(event)+'</button>').join('')}
function scrollRankingDetail(){reportHeight();const panel=document.querySelector('.detail-panel');if(panel)parent.postMessage({type:'laneline-ranking-detail',offset:Math.max(0,Math.round(panel.getBoundingClientRect().top))},location.origin)}
function openRankingEvent(event){state.selected='';state.tab='swimmers';state.detail={type:'event',event};state.mobileDetail=true;render();scrollRankingDetail()}
function renderEvent(event){
  const rows=currentAll().map(r=>({r,d:r.events.find(e=>e.event===event)})).filter(x=>x.d?.swim).sort((a,b)=>a.d.rank-b.d.rank||a.r.name.localeCompare(b.r.name));
  document.getElementById('detailTitle').textContent=event+' Rankings';
  document.getElementById('detailBody').innerHTML='<div class="metric-grid"><div class="metric"><span class="label">Event</span><strong>'+esc(event)+'</strong><small>'+esc(DATA.course)+' · '+esc(state.ageGroup)+' · '+esc(genderLabel())+'</small></div><div class="metric"><span class="label">Swimmers</span><strong>'+rows.length+'</strong><small>All saved event results</small></div></div><h3>Event Ranking</h3><div class="mini-table">'+rows.map(x=>'<button type="button" class="mini-row swimmer-summary-row" data-name="'+esc(x.r.name)+'"><span><strong>#'+x.d.rank+' '+esc(x.r.name)+'</strong><small>'+esc(x.r.team)+'</small></span><span><strong>'+esc(x.d.swim.time)+'</strong><small>'+fmtDate(x.d.swim.date)+'</small></span></button><div class="mini-note">'+esc(x.d.swim.meet||'Meet unavailable')+' · '+esc(x.d.swim.std||'Standard unavailable')+'</div>').join('')+'</div>';
}
let strokeEvent='';
function renderStrokes(){
  const stroke=document.getElementById('rankingStroke').value||'Free';
  const events=DATA.eventOrder.filter(event=>event.endsWith(' '+stroke)).sort((a,b)=>parseInt(a)-parseInt(b));
  if(!events.includes(strokeEvent))strokeEvent=events[0]||'';
  document.getElementById('strokeDistances').innerHTML=events.map(event=>'<button type="button" data-stroke-event="'+esc(event)+'" aria-pressed="'+(strokeEvent===event)+'">'+esc(event)+'</button>').join('');
  const rows=currentAll().map(r=>({r,event:r.events.find(e=>e.event===strokeEvent)})).filter(x=>x.event?.swim).sort((a,b)=>a.event.rank-b.event.rank||a.r.name.localeCompare(b.r.name));
  document.getElementById('strokeRankingTitle').textContent=(strokeEvent||'Stroke')+' · '+(DATA.course||'SCY')+' · '+state.ageGroup+' '+genderLabel();
  document.getElementById('strokeRankingCount').textContent=rows.length+' swimmers';
  document.getElementById('strokeRankingBody').innerHTML=rows.length?rows.map(({r,event:e})=>'<tr><td><strong>#'+e.rank+'</strong></td><td><strong>'+esc(r.name)+'</strong><br><small>'+r.age+' years old</small></td><td>'+esc(r.team)+'</td><td class="stroke-time"><span>'+esc(e.swim.time)+'</span></td><td><span class="pill">'+esc(e.swim.std||'N/A')+'</span></td><td>'+esc(e.swim.meet||'Meet unavailable')+'<br><small>'+fmtDate(e.swim.date)+'</small></td></tr>').join(''):'<tr><td colspan="6"><p class="empty">No saved times for this stroke and group.</p></td></tr>';
}
const renderDashboard=render;
const drawTeamTrend=renderTeamTrendChart,drawStrongTypes=renderStrongTypeChart,drawTeamDistribution=renderTeamDistribution;
renderTeamTrendChart=function(){if(state.tab==='teams')drawTeamTrend()};
renderStrongTypeChart=function(){if(state.tab==='teams')drawStrongTypes()};
renderTeamDistribution=function(){if(state.tab==='teams')drawTeamDistribution()};
function renderRelays(){
  if(DATA.relaysPending){document.getElementById('relayResults').innerHTML='<p class="muted" role="status">Calculating relay lineups…</p>';return;}
  const division=document.getElementById('relayDivision').value||'boys',select=document.getElementById('relayEvent'),old=select.value;
  select.innerHTML=(DATA.relayEvents||[]).map(e=>'<option value="'+esc(e.id)+'">'+esc(e.label)+'</option>').join('');
  select.value=(DATA.relayEvents||[]).some(e=>e.id===old)?old:((DATA.relayEvents||[])[0]?.id||'');
  const rows=DATA.relays?.[[state.ageGroup,division,select.value].join('|')]||[],fastest=rows.find(r=>r.complete)?.total;
  document.getElementById('relayResults').innerHTML='<h2>'+esc(state.ageGroup)+' '+esc(DATA.course)+' Team Rankings</h2>'+rows.map(r=>'<details class="relay-team"><summary><span class="relay-place">'+(r.rank?'#'+r.rank:'—')+'</span><strong>'+esc(r.team)+' '+esc(r.squad)+'</strong><span class="relay-total">'+(r.complete?esc(r.time):'Incomplete')+'</span><small>'+(r.complete?(r.total===fastest?'Fastest predicted':'+'+((r.total-fastest)/100).toFixed(2)+'s behind'):r.eligible+' eligible swimmers; no complete lineup')+'</small>'+(r.complete?'<span class="relay-roster">'+r.lineup.map((leg,i)=>'<span><b>Leg '+(i+1)+' · '+esc(leg.stroke)+'</b>'+esc(leg.name)+'</span>').join('')+'</span>':'')+'</summary>'+(r.complete?'<div class="relay-legs">'+r.lineup.map((leg,i)=>'<div><span class="label">Leg '+(i+1)+' · '+leg.distance+' '+esc(leg.stroke)+'</span><strong>'+esc(leg.name)+'</strong><p>'+esc(leg.division==='boys'?'Boy':'Girl')+' · '+esc(leg.time)+'</p><small>'+esc(leg.meet)+' · '+esc(leg.date||'Date unavailable')+'</small></div>').join('')+'</div>':'<p class="muted">Four different swimmers with matching-course event times are required'+(division==='mixed'?', including two boys and two girls':'')+'.</p>')+'</details>').join('')+(rows.length?'':'<p class="empty">No saved team swimmers match this age group and division.</p>');
}
render=function(){renderDashboard();renderEventNav();const relay=state.tab==='relays',strokes=state.tab==='strokes';document.getElementById('relaysTab').classList.toggle('active',relay);document.getElementById('relaysView').classList.toggle('active',relay);document.getElementById('strokesTab').classList.toggle('active',strokes);document.getElementById('strokesView').classList.toggle('active',strokes);document.getElementById('rankingEventNav').style.display=relay||strokes?'none':'flex';document.getElementById('genderSelect').disabled=relay;document.getElementById('swimmerSelect').disabled=relay||strokes;if(relay)renderRelays();if(strokes)renderStrokes()};

document.getElementById('rankingStroke').addEventListener('change',()=>{renderStrokes();reportHeight()});
document.getElementById('strokeDistances').addEventListener('click',event=>{const button=event.target.closest('[data-stroke-event]');if(button){strokeEvent=button.dataset.strokeEvent;renderStrokes();reportHeight()}});
document.getElementById('relayDivision').addEventListener('change',()=>{renderRelays();reportHeight()});
document.getElementById('relayEvent').addEventListener('change',()=>{renderRelays();reportHeight()});
document.getElementById('rankingEventNav').addEventListener('click',event=>{const button=event.target.closest('[data-event]');if(button)openRankingEvent(button.dataset.event)});
window.addEventListener('message',event=>{if(event.source!==parent||event.origin!==location.origin||event.data?.type!=='laneline-ranking-data')return;Object.assign(DATA,event.data.data);document.getElementById('rankingCourse').value=DATA.course;render();reportHeight()});
document.getElementById('rankingCourse').addEventListener('change',event=>parent.postMessage({type:'laneline-ranking-course',course:event.target.value},location.origin));
new ResizeObserver(reportHeight).observe(document.body);
parent.postMessage({type:'laneline-ranking-ready'},location.origin);
</script>`;
    const relayStyles='<style>.relay-team{border:1px solid #c9dbef;background:#fff;margin:12px 0;border-radius:6px;overflow:hidden}.relay-team summary{display:grid;grid-template-columns:45px minmax(150px,1fr) 110px 160px;align-items:center;gap:12px;padding:16px;background:#edf5ff;cursor:pointer}.relay-team summary:hover{background:#dcecff}.relay-team[open] summary{border-bottom:1px solid #c9dbef}.relay-place{font-weight:700;color:#175eae}.relay-total{font-size:20px;font-variant-numeric:tabular-nums}.relay-legs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;padding:18px}.relay-legs strong{display:block;overflow-wrap:anywhere}.relay-legs p{margin:8px 0}.relay-team>p{padding:16px}@media(max-width:750px){.relay-team summary{grid-template-columns:35px 1fr auto}.relay-team summary small{grid-column:2/-1}.relay-legs{grid-template-columns:repeat(2,minmax(0,1fr))}}</style>';
    const rosterStyles='<style>.relay-roster{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding-top:6px}.relay-roster>span{font-size:13px;overflow-wrap:anywhere;color:#1c4e7a}.relay-roster b{display:block;font-size:11px;color:#617b96;margin-bottom:4px}@media(max-width:750px){.relay-roster{grid-template-columns:repeat(2,minmax(0,1fr))}}</style>';
    html=html.replace(/<section class="rules-panel"><h2>Ranking method<\/h2>([\s\S]*?)<\/section>/,'<details class="rules-panel"><summary>Ranking method</summary>$1</details>');
    const compactStyles=`<style id="ranking-compact-styles">
body{font-size:13px;line-height:1.4;letter-spacing:0}
.stroke-controls{display:flex;align-items:end;gap:12px;flex-wrap:wrap;margin-bottom:10px}.stroke-controls .field{width:190px}.stroke-controls .ranking-event-nav{margin:0}.stroke-table{min-width:640px}.stroke-table tbody tr{cursor:default}.stroke-time{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;color:#175eae}
header{padding:12px 16px}h1{font-size:20px}.eyebrow{font-size:10px;letter-spacing:0;margin-bottom:2px}
main{padding:12px}.disclaimer{padding:7px 10px;margin-bottom:10px;font-size:12px}.disclaimer small{margin-top:2px;font-size:11px}
.controls{grid-template-columns:90px 110px 110px minmax(180px,1fr);padding:8px;gap:8px;margin-bottom:8px}
.field label{font-size:11px;margin-bottom:3px}.field select{height:34px;padding:0 8px;font-size:13px}
.ranking-event-nav{gap:5px;margin-bottom:8px}.ranking-event-nav button{padding:4px 8px;min-height:30px;font-size:12px}
.tabs{gap:6px;margin-bottom:10px}.tab-button{padding:6px 10px;font-size:12px;min-height:32px}
.content-grid{grid-template-columns:minmax(0,1fr) 300px;gap:10px;margin-bottom:10px}
.panel-head{padding:8px 10px;gap:8px}.panel-head h2{font-size:15px}.panel-head button{padding:5px 8px;font-size:12px}
th,td{padding:7px 8px}th{font-size:10px}td{font-size:12px;vertical-align:middle}td small{font-size:11px}
.rank-change{font-size:10px;margin-top:1px}.pill{min-height:20px;padding:1px 6px;font-size:10px}
.event-list{display:grid;grid-template-columns:repeat(2,minmax(135px,1fr));gap:3px}
.event-list .event-link{display:flex;align-items:center;justify-content:space-between;gap:5px;min-height:25px;padding:3px 5px;border-radius:4px;font-size:11px;white-space:nowrap}
.event-list .event-link strong{color:#175eae}.event-list .event-link span:last-child{font-variant-numeric:tabular-nums}
.detail-body{padding:10px}.metric-grid{gap:6px;margin-bottom:10px}.metric{padding:7px}.metric strong{font-size:17px}.label{font-size:10px;margin-bottom:2px}
.detail-body h3{font-size:13px;margin:10px 0 5px}.swim-card{padding:7px 0}.swim-card h3{font-size:13px}.swim-meta{font-size:11px}
.mini-row{padding:7px 0;gap:8px}.mini-note{font-size:11px;margin:-4px 0 5px;padding-bottom:5px}
.rules-panel{padding:8px 10px;font-size:12px}.rules-panel summary{cursor:pointer;font-weight:700;color:#175eae}.rules-panel ul{padding-left:18px;margin:8px 0 0}.rules-panel li{margin-bottom:5px}
.team-chart-body{padding:10px}.team-row{padding:8px 0;gap:8px}.team-dist-body{padding:2px 10px}
.relay-team{margin:7px 0}.relay-team summary{padding:10px;gap:8px;grid-template-columns:35px minmax(130px,1fr) 90px 140px}.relay-total{font-size:17px}.relay-roster{gap:8px;padding-top:2px}.relay-roster>span{font-size:12px}.relay-roster b{margin-bottom:2px;font-size:10px}.relay-legs{padding:10px;gap:10px}.relay-legs p{margin:5px 0}
.stroke-time span,.relay-total,.event-link span:last-child{display:inline-block;transform-origin:center}
@keyframes ranking-time-pop{0%,100%{scale:1}40%{scale:1.2}70%{scale:.96}}
@media(hover:hover) and (pointer:fine){.stroke-time:hover span,.relay-total:hover,.event-link:hover span:last-child,.mini-row:hover>span:last-child>strong{animation:ranking-time-pop 420ms cubic-bezier(.22,1,.36,1)}}
@media(prefers-reduced-motion:reduce){.stroke-time span,.relay-total,.event-link span:last-child,.mini-row>span:last-child>strong{animation:none!important;scale:1!important}}
@media(min-width:1500px){.event-list{grid-template-columns:repeat(3,minmax(135px,1fr))}}
@media(max-width:1150px){.content-grid{grid-template-columns:1fr}.event-list{grid-template-columns:repeat(3,minmax(135px,1fr))}}
@media(max-width:700px){main{padding:8px}.controls{grid-template-columns:1fr 1fr}.field select{height:36px}.ranking-event-nav button{min-height:34px}.event-list{grid-template-columns:repeat(2,minmax(135px,1fr))}.relay-team summary{grid-template-columns:28px 1fr auto}.relay-legs{grid-template-columns:repeat(2,minmax(0,1fr))}.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>`;
    return html.replace('</body>',relayStyles+rosterStyles+bridge+compactStyles+'</body>');
  }
  return {data,shell};
});
