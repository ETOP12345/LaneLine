(function(root){
  'use strict';
  const checkedAt='2026-11-19';
  const classic='2026 PN CSC Fall Classic';
  const zones='2026 SR Western Zone Age Group Championships';
  function event(event,time,points,date,meet){return {event,time,points,date,meet};}
  function record(program,course,season,age,score,club,lsc,zone,national,events=[]){
    return {program,course,season,age,score,ranks:{club,lsc,zone,national},events};
  }
  // Official Data Hub snapshots, not scores inferred from local best times.
  const snapshots={'9DCE8A4B52EF4A':[
    record('IMX','LCM','2024',10,1126,3,27,221,1022),
    record('IMX','LCM','2025',11,2185,2,21,115,524),
    record('IMX','SCY','2025-2026',12,2399,7,31,286,1182),
    record('IMX','LCM','2026',12,2909,2,7,64,312),
    record('IMX','SCY','2026-2027',12,3097,1,2,24,95,[
      event('100 Breast','1:06.81',828,'2026-10-24','2026 OR THSC FALL INVITATIONAL'),
      event('200 IM','2:18.41',647,'2026-10-03',classic),
      event('500 Free','5:32.38',620,'2026-10-03',classic),
      event('100 Fly','1:07.17',531,'2026-10-03',classic),
      event('100 Back','1:09.57',471,'2026-10-03',classic)
    ]),
    record('IMR','SCY','2022-2023',9,720,5,56,581,2618),
    record('IMR','SCY','2023-2024',9,945,7,52,520,2373),
    record('IMR','LCM','2024',10,1353,4,38,317,1431),
    record('IMR','SCY','2023-2024',10,726,10,108,1144,4904),
    record('IMR','LCM','2025',11,2254,2,18,162,710),
    record('IMR','SCY','2024-2025',11,1597,3,50,550,2308),
    record('IMR','SCY','2025-2026',11,2842,5,13,149,608),
    record('IMR','SCY','2025-2026',12,2346,8,38,393,1549),
    record('IMR','LCM','2026',12,2950,2,5,75,374,[
      event('50 Breast','36.09',765,'2026-08-05',zones),
      event('200 IM','2:37.48',688,'2026-08-06',zones),
      event('50 Fly','34.33',513,'2026-05-17','2026 PN IST Springtime Madness Long Course Challenge'),
      event('200 Free','2:29.00',508,'2026-05-17','2026 PN IST Springtime Madness Long Course Challenge'),
      event('50 Back','37.44',476,'2026-06-06','2026 PN VAST Summer Sprints')
    ])
  ]};
  let imported={swimmers:{}},loadPromise;
  if(typeof module!=='undefined'&&module.exports){try{imported=require('./imx-imr-data.json');}catch{}}
  function load(){
    if(!loadPromise)loadPromise=fetch('imx-imr-data.json').then(r=>{if(!r.ok)throw Error('Score import unavailable');return r.json();}).then(data=>{imported=data;}).catch(()=>{loadPromise=null;});
    return loadPromise;
  }
  function records(memberId,program,course){
    return (imported.swimmers[memberId]?.records||snapshots[memberId]||[]).filter(r=>r.program===program&&(!course||course==='All'||r.course===course)).slice().sort((a,b)=>Number(b.season.slice(-4))-Number(a.season.slice(-4))||b.age-a.age||(b.course==='LCM')-(a.course==='LCM'));
  }
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function leaderboard(current,swimmer,roster=[],data=imported){
    if(!current||!swimmer?.division)return [];
    const profiles=new Map([...roster,swimmer].map(s=>[s.usaSwimmingMemberId,s]));
    const entries=[];
    for(const [memberId,profile] of profiles){
      if(profile.division!==swimmer.division)continue;
      const matches=(data.swimmers[memberId]?.records||snapshots[memberId]||[]).filter(r=>r.program===current.program&&r.course===current.course&&r.season===current.season&&Number(r.age)===Number(current.age)&&Number.isFinite(r.score));
      if(!matches.length)continue;
      entries.push({memberId,name:profile.name,team:profile.team||'',score:Math.max(...matches.map(r=>r.score))});
    }
    entries.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
    entries.forEach((entry,i)=>{entry.rank=i&&entry.score===entries[i-1].score?entries[i-1].rank:i+1;});
    return entries;
  }
  function mount(container,swimmer,roster=[]){
    if(!container)return;
    let program=container.dataset.program||'IMX',course=container.dataset.course||'All';
    const memberId=swimmer?.usaSwimmingMemberId;
    const rows=records(memberId,program,course);
    let selected=Number(container.dataset.record)||0;
    if(selected>=rows.length)selected=0;
    const current=rows[selected];
    const standings=leaderboard(current,swimmer,roster);
    const expanded=container.dataset.leaderboard==='true';
    const verified=imported.swimmers[memberId];
    const link=memberId?'https://data.usaswimming.org/search/athlete/'+encodeURIComponent(memberId)+'/imx-imr?program='+program:null;
    container.innerHTML=`<header class="imx-heading"><div><div class="section-label">All-around performance</div><h2>IMX / IMR</h2><p class="imx-athlete">${esc(swimmer?.name||'Select a swimmer in Swimmers')}</p></div><div class="imx-filters"><div class="imx-program" role="group" aria-label="Scoring program">${['IMX','IMR'].map(p=>`<button type="button" data-program="${p}" aria-pressed="${p===program}">${p}</button>`).join('')}</div><label>Course<select id="imx-course"><option${course==='All'?' selected':''}>All</option><option${course==='SCY'?' selected':''}>SCY</option><option${course==='LCM'?' selected':''}>LCM</option><option${course==='SCM'?' selected':''}>SCM</option></select></label></div></header>
    ${!current?`<div class="imx-empty"><h3>${verified?.programs.includes(program)?'No official':'No imported'} ${program} scores${course==='All'?'':' for '+esc(course)}</h3><p>${verified?.programs.includes(program)?'Data Hub had no matching scores at the last check.':'Official scores have not been imported for this swimmer and course.'} Local race times are not treated as official IMX / IMR points.</p></div>`:`
    <div class="imx-layout"><section class="imx-history"><h3>Season history</h3><div class="imx-season-list">${rows.map((r,i)=>`<button type="button" class="imx-season" data-record="${i}" aria-pressed="${i===selected}"><span><b>${esc(r.season)}</b><small>${r.course} · Age ${r.age}</small></span><span class="imx-history-bar" aria-hidden="true"><i style="width:${r.score/Math.max(...rows.map(x=>x.score))*100}%"></i></span><strong>${r.score.toLocaleString()}</strong></button>`).join('')}</div></section>
    <section class="imx-detail"><div class="imx-score"><div><span class="section-label">${current.course} ${esc(current.season)} · Age ${current.age}</span><h3>${program} score</h3></div><button type="button" class="imx-score-button" aria-label="${program} score ${current.score.toLocaleString()}: show swimmer rankings" aria-expanded="${expanded}" aria-controls="imx-leaderboard"><strong>${current.score.toLocaleString()}</strong><small>points · ${current.eventCount||5} events</small><span>Rankings ${expanded?'▴':'▾'}</span></button></div>
    <section id="imx-leaderboard" class="imx-leaderboard"${expanded?'':' hidden'}><h3>${program} leaderboard</h3><p class="insight-meta">${esc(current.season)} · ${current.course} · Age ${current.age} · ${esc(swimmer.division)} · ${standings.length} imported swimmers. Saved scores only, not a complete national ranking.</p><div class="imx-table-wrap"><table class="imx-events"><thead><tr><th>Rank</th><th>Swimmer / team</th><th>Score</th></tr></thead><tbody>${standings.map(r=>`<tr${r.memberId===memberId?' class="imx-current" aria-current="true"':''}><td>#${r.rank}</td><td><b>${esc(r.name)}</b><small>${esc(r.team)}</small></td><td><strong>${r.score.toLocaleString()}</strong></td></tr>`).join('')}</tbody></table></div></section>
    <div class="imx-ranks">${Object.entries(current.ranks).map(([label,rank])=>`<div><span>${label==='lsc'?'PNS':label==='zone'?'Western Zone':label==='national'?'National':'Club'}</span><strong>${rank===null?'Unranked':'#'+rank.toLocaleString()}</strong></div>`).join('')}</div>
    <h3>Counted events</h3>${current.events.length?`<div class="imx-table-wrap"><table class="imx-events"><thead><tr><th>Event / meet</th><th>Time</th><th>Points</th></tr></thead><tbody>${current.events.map(e=>`<tr><td><b>${esc(e.event)} ${current.course}</b><small>${esc(e.meet)} · ${esc(e.date)}</small></td><td>${esc(e.time)}</td><td><strong>${e.points}</strong></td></tr>`).join('')}</tbody></table></div>`:'<p class="insight-meta">The score and ranks are imported; this season\'s event breakdown has not been imported yet.</p>'}</section></div>`}
    <footer class="imx-footer"><span>Official Data Hub snapshot${verified?' · Checked '+esc(verified.checkedAt.slice(0,10)):memberId&&snapshots[memberId]?' · Checked '+checkedAt:''}. Rankings may change after this check.</span>${link?`<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open Data Hub ↗</a>`:''}</footer>`;
    container.querySelector('.imx-score-button')?.addEventListener('click',e=>{const button=e.currentTarget;const open=button.getAttribute('aria-expanded')!=='true';container.dataset.leaderboard=String(open);button.setAttribute('aria-expanded',String(open));button.querySelector('span').textContent='Rankings '+(open?'▴':'▾');container.querySelector('#imx-leaderboard').hidden=!open;});
    container.querySelectorAll('[data-program]').forEach(button=>button.addEventListener('click',()=>{container.dataset.program=button.dataset.program;container.dataset.record='0';mount(container,swimmer,roster);}));
    container.querySelector('#imx-course').addEventListener('change',e=>{container.dataset.course=e.target.value;container.dataset.record='0';mount(container,swimmer,roster);});
    container.querySelectorAll('[data-record]').forEach(button=>button.addEventListener('click',()=>{container.dataset.record=button.dataset.record;mount(container,swimmer,roster);}));
  }
  const api={records,mount,checkedAt,load,leaderboard};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.LaneLineIMX=api;
})(typeof window==='undefined'?globalThis:window);
