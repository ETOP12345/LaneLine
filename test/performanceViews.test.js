const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const I=require('../insights-engine');
const M=require('../upcoming-meets');
const data=require('../time-standards.json');
const race=(event,time,date='10/10/2026')=>({event:event+' SCY',time,date,meet:'Test'});
const person=(id,age,bestTimes)=>({id,name:id,division:'boys',ageGroup:String(age),bestTimes,timeHistory:bestTimes});
test('peer rankings break same-age rank ties against 13-14 and deduplicate athletes',()=>{
  const sw=person('me',12,[race('50 Free','25.00'),race('50 Breast','30.00')]);
  const other=person('other',12,[race('50 Free','26.00'),race('50 Breast','31.00')]);
  const older=person('older',13,[race('50 Free','24.00'),race('50 Breast','32.00')]);
  const ratings=I.strengths(sw,[sw,{...sw,id:'copy',usaSwimmingMemberId:'same'},{...sw,usaSwimmingMemberId:'same'},other,older],'SCY',data);
  assert.equal(ratings[0].row.event,'50 Breast SCY');
  assert.equal(ratings[0].rank,1);assert.equal(ratings[0].olderRank,1);
  assert.equal(ratings[1].olderRank,2);
});
test('signature events allow two co-leading peer-ranked events, never invent peers',()=>{
  const rows=[{row:{event:'50 Breast SCY'},rank:1,total:8,olderRank:4,olderTotal:10,ratio:1},
    {row:{event:'100 Breast SCY'},rank:1,total:8,olderRank:7,olderTotal:10,ratio:1.01}];
  assert.equal(I.signatureEvents(rows).length,2);
  assert.deepEqual(I.signatureEvents(rows.map(r=>({...r,total:1}))),[]);
});
test('AGI advice uses published order, SCY cuts, qualifying dates and daily limits',()=>{
  const sw=person('me',12,[race('50 Breast','31.00'),race('200 Breast','2:25.00'),race('200 IM','2:20.00'),race('100 Breast','1:07.00'),race('100 Free','59.00'),race('50 Fly','29.00'),race('400 IM','4:50.00'),race('500 Free','5:30.00')]);
  const plan=M.recommendations(M.meets.find(m=>m.id==='agi'),sw,[sw],data);
  assert.equal(plan.length,3);assert.equal(plan[0].choices.length,1);
  for(const day of plan){assert.ok(day.choices.length<=day.limit);assert.ok(day.choices.every(c=>day.events.includes(c.name)&&c.cut));}
  const old=person('old',12,[race('100 Breast','1:07.00','01/01/2024')]);
  assert.ok(M.recommendations(M.meets[1],old,[old],data).every(d=>d.choices.length===0));
});
test('Sockeye plans keep 12-and-under in one session and use the younger schedule',()=>{
  const sw=person('me',10,['50 Free','50 Back','50 Breast','50 Fly','100 IM'].map(e=>race(e,'40.00')));
  const plan=M.recommendations(M.meets[0],sw,[sw],data);
  assert.equal(plan.length,2);assert.ok(plan.every(d=>d.name.includes('10 & under')&&d.choices.length<=4));
  assert.equal(M.recommendations(M.meets[0],{...sw,ageGroup:'15'},[sw],data).length,0);
});
test('PNS Champs prioritizes strongest cut-qualified events without inventing day assignments',()=>{
  const meet=M.meets.find(m=>m.id==='pns-champs');
  assert.equal(meet.start,'2026-12-10');assert.equal(meet.end,'2026-12-13');
  assert.equal(meet.schedulePending,true);assert.equal(meet.teamDeadline,null);
  const sw=person('me',12,[race('100 Breast','1:06.81'),race('200 Breast','2:24.95'),race('50 Breast','30.91'),race('200 IM','2:18.41'),race('400 IM','4:50.42'),race('500 Free','5:32.38'),race('100 Fly','1:07.17'),race('50 Free','50.00')]);
  const [plan]=M.recommendations(meet,sw,[sw],data);
  assert.equal(plan.date,null);assert.equal(plan.provisional,true);assert.equal(plan.choices.length,6);
  assert.ok(plan.choices.every(c=>c.cut&&c.name!=='50 Free'));
  assert.ok(plan.choices[0].name.includes('Breast'));
  assert.equal(plan.choices[0].priority,1);
  assert.equal(M.recommendations(meet,{...sw,ageGroup:'15'},[sw],data).length,0);
  assert.equal(M.recommendations(meet,{...sw,activePns:false},[sw],data).length,0);
  const [unavailable]=M.recommendations(meet,sw,[sw],{meets:[]});
  assert.equal(unavailable.choices.length,0);assert.match(unavailable.notice,/unavailable/);
});
test('PNS Champs shortlists use correct boys and girls age-group cuts',()=>{
  const S=require('../standards-engine'),meet=M.meets.find(m=>m.id==='pns-champs');
  const standard=data.meets.find(m=>m.id==='pns-champs');
  for(const division of ['boys','girls'])for(const age of [9,10,11,12,13,14]){
    const sw={...person('me',age,[]),division};
    const cut=S.meetCut(standard,'100 Breast SCY',sw);assert.ok(cut);
    sw.bestTimes=[race('100 Breast',cut)];sw.timeHistory=sw.bestTimes;
    const [plan]=M.recommendations(meet,sw,[sw],data);
    assert.equal(plan.choices.length,1);assert.equal(plan.choices[0].cut,cut);
  }
});
test('growth has an independent selectable legend, percent scale and date detail',()=>{
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  assert.ok(html.includes('class="growth-event-button"'));
  assert.ok(html.includes('plotGrowth:options.percent?'));
  assert.ok(html.includes('id="growth-scale"'));
  assert.ok(html.includes('class="peer-lane '));
  assert.ok(html.includes('renderMeetPlanner(sw)'));
});
test('growth renders one clickable selector per event, with percent and focused scales',()=>{
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  const source=html.slice(html.indexOf('function renderGrowthChart('),html.indexOf('function normalizeGrowthEvent('));
  const context={chartPalette:['#0078d4','#e34c74'],worldRecordSecondsForEvent:()=>0,
    escapeHtml:s=>s,escapeSvgText:s=>s,formatSignedGrowth:n=>n.toFixed(2)+'s',formatGrowthDate:()=> 'Oct 2026'};
  vm.createContext(context);vm.runInContext(source,context);
  const rows=[{event:'200 Free SCY',seconds:200,time:'3:20.00',dateValue:new Date('2026-01-01')},
    {event:'200 Free SCY',seconds:100,time:'1:40.00',dateValue:new Date('2026-10-01')},
    {event:'50 Breast SCY',seconds:40,time:'40.00',dateValue:new Date('2026-01-01')},
    {event:'50 Breast SCY',seconds:38,time:'38.00',dateValue:new Date('2026-10-01')}];
  const rendered=context.renderGrowthChart(rows,{mode:'all',percent:true,selectedEvent:'50 Breast SCY',title:'Test'});
  assert.equal((rendered.match(/class="growth-event-button"/g)||[]).length,2);
  assert.match(rendered,/aria-pressed="true"/);assert.match(rendered,/5\.4%/);
  assert.match(rendered,/Focus: 50 Breast SCY/);assert.match(rendered,/clip-path=/);
  const detail=context.renderGrowthChart(rows.slice(2),{mode:'event',title:'Breast'});
  assert.match(detail,/Race date/);assert.doesNotMatch(detail,/World record/);
  const wide=context.renderGrowthChart(rows,{mode:'all',width:1500,title:'Wide desktop'});
  assert.match(wide,/viewBox="0 0 1500 660"/);
});

test('desktop layouts use side space with wide growth and two-column best times',()=>{
  const css=fs.readFileSync(require.resolve('../performance.css'),'utf8');
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  assert.match(css,/\.main\{max-width:1800px;width:100%/);
  assert.match(css,/\.best-table>tbody\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.profiles-grid\{grid-template-columns:repeat\(auto-fill,minmax\(230px,1fr\)\)/);
  assert.ok(html.includes('width:main.clientWidth'));
  assert.ok(html.includes('card-section growth-race'));
});
