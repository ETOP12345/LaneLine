const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const D=require('../rankings-dashboard');
const standards=require('../time-standards.json');
test('rankings reuses the original dashboard UI without old Zone data or selection rules',()=>{
  const html=D.shell(fs.readFileSync(path.join(__dirname,'../western-zone-dashboard/index.html'),'utf8'));
  for(const id of ['rankingBody','detailBody','teamsView','teamTrendChart','strongTypeChart','rankingCourse','relaysTab','relayDivision','relayEvent','relayResults'])assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(html.length<65000,'historical embedded payload removed');
  assert.match(html,/sum of the six best event ranks/);
  assert.match(html,/6 Scoring Events/);
  assert.doesNotMatch(html,/Western Zone Ranking Dashboard|July 25, 2026|Pace Index/);
  for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
});
function six(id,time='1:00.00'){
  return {id,name:id,ageGroup:'12',division:'boys',bestTimes:['50 Free','100 Free','200 Free','50 Back','100 Back','200 Back'].map(event=>({event:event+' SCY',time}))};
}

test('fast initial rankings preserve scores while deferring relay calculations',()=>{
  const swimmers=[six('A'),six('B','1:10.00')];
  const initial=D.data(swimmers,standards,'SCY',{includeRelays:false});
  const complete=D.data(swimmers,standards,'SCY');
  assert.deepEqual(initial.groups,complete.groups);
  assert.deepEqual(initial.relays,{});
  assert.equal(initial.relaysPending,true);
  assert.equal(complete.relaysPending,false);
});

test('worker publishes rankings before calculating and publishing relay lineups',()=>{
  const messages=[],steps=[],relays={test:[]};
  const self={postMessage(message){messages.push(message);steps.push(message.partial?'rankings':'relays');}};
  const context=vm.createContext({self,importScripts(){},LaneLineRankingDashboard:{data(swimmers,standards,course,options){assert.equal(options.includeRelays,false);return {groups:{}};}},LaneLineRelays:{boards(){steps.push('calculate relays');return relays;}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../rankings-worker.js'),'utf8'),context);
  self.onmessage({data:{id:1,swimmers:[],standards:{},course:'SCY'}});
  assert.deepEqual(steps,['rankings','calculate relays','relays']);
  assert.equal(messages[0].partial,true);
  assert.equal(messages[1].relays,relays);
  assert.equal(messages[1].id,1);
});
test('overall uses six lowest event ranks and places partial swimmers after complete swimmers',()=>{
  const a=six('A'),c=six('C','1:10.00'),partial={...six('B','20.00'),bestTimes:[{event:'50 Free SCY',time:'20.00'}]};
  const rows=D.data([partial,c,a],standards,'SCY').groups['11-12|M'];
  assert.deepEqual(rows.map(r=>r.name),['A','C','B']);
  assert.equal(rows[0].score,7);assert.equal(rows[1].score,13);
  assert.equal(rows[0].topSix.length,6);assert.equal(rows[2].complete,false);
  assert.equal(rows[0].pp,'unavailable');
});
test('AAA event counts break total-rank ties without inventing power points',()=>{
  const a=six('Z'),b=six('A');
  a.bestTimes.push({event:'50 Free LCM',time:'20.00'},{event:'50 Free LCM',time:'21.00'});
  const rows=D.data([b,a],standards,'SCY').groups['11-12|M'];
  assert.equal(rows[0].name,'Z');assert.equal(rows[0].cuts.lcmAAA,1);
  assert.equal(rows[0].score,rows[1].score);assert.equal(rows[1].rank,2);
});
test('power points are only used when all swimmers tied on score and cuts have complete totals',()=>{
  const a=six('A'),b=six('B');
  a.bestTimes.forEach(r=>r.powerPoints=500);b.bestTimes.forEach(r=>r.powerPoints=600);
  let rows=D.data([a,b],standards,'SCY').groups['11-12|M'];
  assert.equal(rows[0].name,'B');assert.equal(rows[0].pp,3600);
  delete b.bestTimes[0].powerPoints;
  rows=D.data([a,b],standards,'SCY').groups['11-12|M'];
  assert.deepEqual(rows.map(r=>r.rank),[1,1]);
});
test('dashboard preserves separate groups, course, tied event ranks and saved meet details',()=>{
  const a={id:'a',name:'A',ageGroup:'12',division:'boys',bestTimes:[{event:'50 Free SCY',time:'26.00',meet:'Test meet',date:'2026-10-01'},{event:'100 Free SCY',time:'58.00'},{event:'200 Free SCY',time:'2:06.00'}]};
  const b={...a,id:'b',name:'B'};
  const data=D.data([a,b],standards,'SCY');
  assert.deepEqual(data.ageGroups,['11-12','13-14']);
  assert.equal(data.groups['11-12|M'].length,2);
  assert.equal(data.groups['13-14|M'].length,0);
  assert.equal(data.groups['11-12|M'][1].events[0].rank,1);
  assert.ok(data.groups['11-12|M'][0].events.some(e=>e.swim.meet==='Test meet'));
  assert.equal(D.data([a],standards,'LCM').groups['11-12|M'].length,0);
});
test('original dashboard renders live payloads, teams, age switches and swimmer details',()=>{
  const elements=new Map(),listeners={};
  function element(id){if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',style:{},handlers:{},classList:{toggle(){}},insertAdjacentHTML(position,text){this.innerHTML+=text;},addEventListener(type,handler){this.handlers[type]=handler;},getBoundingClientRect(){return {height:1000,top:250};}});return elements.get(id);}
  const messages=[],parent={postMessage(message){messages.push(message);}},location={origin:'http://localhost:5180'};
  const document={querySelector:element,getElementById:id=>element('#'+id),querySelectorAll:()=>[],body:element('body'),addEventListener(){}};
  const context=vm.createContext({document,parent,location,window:{addEventListener(type,fn){listeners[type]=fn;}},ResizeObserver:class{observe(){}},console});
  const html=D.shell(fs.readFileSync(path.join(__dirname,'../western-zone-dashboard/index.html'),'utf8'));
  for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(script[1],context);
  const sw={id:'test',name:'Test Swimmer',team:'Test Club',ageGroup:'12',division:'boys',bestTimes:[{event:'50 Free SCY',time:'26.00'},{event:'100 Free SCY',time:'58.00'},{event:'200 Free SCY',time:'2:06.00'}]};
  const data=D.data([sw],standards,'SCY');
  listeners.message({source:parent,origin:location.origin,data:{type:'laneline-ranking-data',data}});
  assert.match(element('#rankingBody').innerHTML,/Test Swimmer/);
  assert.match(html,/<details class="rules-panel"><summary>Ranking method<\/summary>/);
  assert.match(html,/id="ranking-compact-styles"/);
  assert.match(element('#rankingBody').innerHTML,/title="50 Free #1/);
  assert.match(element('#rankingBody').innerHTML,/<span>50 Free<\/span><strong>#1<\/strong><span>26.00<\/span>/);
  assert.match(element('#rankingEventNav').innerHTML,/data-event="50 Free"/);
  const row=data.groups['11-12|M'][0];
  data.groups['11-12|M']=Array.from({length:60},(_,i)=>({...row,name:'Swimmer '+i,rank:i+1,events:row.events.map(e=>({...e,rank:i+1}))}));
  listeners.message({source:parent,origin:location.origin,data:{type:'laneline-ranking-data',data}});
  element('#rankingEventNav').handlers.click({target:{closest(){return {dataset:{event:'50 Free'}};}}});
  assert.equal(element('#detailTitle').textContent,'50 Free Rankings');
  assert.match(element('#detailBody').innerHTML,/Swimmer 59/);
  assert.match(element('#detailBody').innerHTML,/All saved event results/);
  assert.ok(messages.some(m=>m.type==='laneline-ranking-detail'&&m.offset===250));
  vm.runInContext("state.tab='strokes';render();",context);
  assert.match(element('#strokeRankingBody').innerHTML,/Swimmer 59/);
  assert.match(element('#strokeRankingTitle').textContent,/50 Free.*SCY.*11-12/);
  assert.match(element('#strokeDistances').innerHTML,/data-stroke-event="100 Free"/);
  assert.equal(element('#swimmerSelect').disabled,true);
  element('#strokeDistances').handlers.click({target:{closest(){return {dataset:{strokeEvent:'100 Free'}};}}});
  assert.match(element('#strokeRankingTitle').textContent,/100 Free/);
  assert.match(element('#strokeRankingBody').innerHTML,/58.00/);
  element('#rankingStroke').value='Back';
  element('#rankingStroke').handlers.change();
  assert.match(element('#strokeRankingBody').innerHTML,/No saved times/);
  element('#rankingStroke').value='Free';
  listeners.message({source:parent,origin:location.origin,data:{type:'laneline-ranking-data',data:D.data([sw],standards,'SCY')}});
  vm.runInContext("renderSwimmer('Test Swimmer');state.tab='teams';render();",context);
  assert.match(element('#teamDistributionBody').innerHTML,/Test Club/);
  vm.runInContext("state.tab='relays';render();",context);
  assert.match(element('#relayResults').innerHTML,/Test Club A/);
  assert.match(element('#relayResults').innerHTML,/Incomplete/);
  assert.equal(element('#genderSelect').disabled,true);
  element('#relayDivision').value='mixed';
  element('#relayDivision').handlers.change();
  assert.match(element('#relayResults').innerHTML,/two boys and two girls/);
  const relaySwimmers=Array.from({length:4},(_,i)=>({...sw,id:'relay'+i,name:'Relay Swimmer '+i}));
  element('#relayDivision').value='boys';
  listeners.message({source:parent,origin:location.origin,data:{type:'laneline-ranking-data',data:D.data(relaySwimmers,standards,'SCY')}});
  const summary=element('#relayResults').innerHTML.match(/<summary>([\s\S]*?)<\/summary>/)[1];
  for(let i=0;i<4;i++)assert.ok(summary.includes('Relay Swimmer '+i));
  assert.match(summary,/relay-roster/);
  vm.runInContext("state.ageGroup='13-14';render();",context);
  assert.match(element('#rankingBody').innerHTML,/No swimmers/);
});
