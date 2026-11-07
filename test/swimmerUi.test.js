const test=require('node:test');
const assert=require('node:assert/strict');
const ui=require('../swimmer-ui');

test('best-times CSV escapes quotes, delimiters, newlines and spreadsheet formulas',()=>{
  const csv=ui.bestTimesCsv({name:'Ethan "E" Wang',team:'=HYPERLINK("bad")'},[{event:'100 Free SCY',time:'58.84',meet:'Fall, Classic\nFinals',date:'2026-10-04'}],'SCY');
  assert.ok(csv.startsWith('\uFEFF"Swimmer"'));
  assert.ok(csv.includes('"Ethan ""E"" Wang"'));
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"Fall, Classic\nFinals"'));
  assert.ok(csv.includes('"SCY","58.84"'));
  assert.equal(ui.bestTimesCsv({name:'Ethan'},[],'SCY').split('\r\n').length,1);
});

test('quick search finds swimmer views and pages with bounded favorite-first results',()=>{
  const swimmers=[{id:'a',name:'Ethan Wang',team:'Bellevue Club Swim Team'},{id:'b',name:'Iris Wang',team:'Pacific Dragons Swim Team'}];
  assert.deepEqual(ui.quickItems(swimmers,'ethan bcst').map(row=>row.page),['best','growth']);
  assert.equal(ui.quickItems(swimmers,'rankings')[0].page,'zone');
  assert.equal(ui.quickItems(swimmers,'',['b'])[0].swimmerId,'b');
  assert.deepEqual(ui.quickItems(swimmers,'no such swimmer'),[]);
  assert.ok(ui.quickItems(Array.from({length:100},(_,id)=>({id:String(id),name:'Wang '+id})),'wang').length<=16);
});

test('roster search matches names and team codes in any order',()=>{
  const sw={name:'Ethan Wang',team:'Bellevue Club Swim Team',ageGroup:'12',division:'boys'};
  assert.equal(ui.matchesSearch(sw,'Wang, Ethan BCST'),true);
  assert.equal(ui.matchesSearch(sw,'bcst 12'),true);
  assert.equal(ui.matchesSearch(sw,'Wang WAVE'),false);
  assert.equal(ui.matchesSearch({name:'Jose Chen',team:'Wave Aquatics'},'CHEN jose wave'),true);
  assert.equal(ui.matchesSearch({name:'Jos\u00e9 Chen'},'jose'),true);
  assert.equal(ui.matchesSearch({name:'\u738b\u660e'},'\u738b'),true);
  assert.equal(ui.matchesSearch(sw,'\u738b'),false);
});

test('view preferences round trip without storing swimmer data or unknown fields',()=>{
  const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  const settings={tab:'growth',bestCourse:'LCM',bestSwimmer:'ethan',growthSwimmer:'ethan',growthCourse:'SCY',growthEvent:'100 Fly SCY'};
  assert.equal(ui.savePreferences(storage,{...settings,swimmers:[{name:'Private',bestTimes:[]}],password:'not-saved'}),true);
  assert.deepEqual(ui.loadPreferences(storage),settings);
  assert.doesNotMatch([...data.values()][0],/Private|password|bestTimes/);
});

test('view preferences ignore corrupt data and invalid options',()=>{
  assert.deepEqual(ui.loadPreferences({getItem:()=>'{broken'}),{});
  assert.deepEqual(ui.loadPreferences({getItem:()=>JSON.stringify({tab:'bad',bestCourse:'bad',growthCourse:'SCM',bestSwimmer:{id:1}})}),{});
  assert.deepEqual(ui.loadPreferences({getItem:()=>null}),{});
});

test('unavailable or full browser storage does not break preferences',()=>{
  const storage={getItem(){throw new Error('Blocked');},setItem(){throw new Error('Quota exceeded');}};
  assert.deepEqual(ui.loadPreferences(storage),{});
  assert.equal(ui.savePreferences(storage,{tab:'best'}),false);
});
test('original nine stay pinned while remaining swimmers sort by family then given name',()=>{
  const pinned=Array.from({length:9},(_,i)=>({id:'p'+i,name:'Pinned '+(9-i)}));
  const swimmers=[{id:'z',name:'Zoe Wang'},pinned[4],{id:'a',name:'Amy Wang'},...pinned.filter((_,i)=>i!==4),{id:'c',name:'Sam Chen'}];
  const before=swimmers.slice();
  const sorted=ui.ordered(swimmers,pinned);
  assert.deepEqual(sorted.slice(0,9),pinned);
  assert.deepEqual(sorted.slice(9).map(s=>s.name),['Sam Chen','Amy Wang','Zoe Wang']);
  assert.deepEqual(swimmers,before);
});
test('sort normalizes spacing and supports explicit family names',()=>{
  assert.deepEqual(ui.nameParts({name:' Anna  Erickson '}),['Erickson','Anna']);
  assert.deepEqual(ui.nameParts({name:'Andy Velazquez Diaz',familyName:'Velazquez Diaz',givenName:'Andy'}),['Velazquez Diaz','Andy']);
});
test('manual ages persist across source refreshes and can be reset',()=>{
  const original={id:'a',ageGroup:'12',bestTimes:[{event:'50 Free SCY',time:'25.00'}]};
  const edited=ui.setAge(original,'13');
  assert.equal(edited.ageGroup,'13');assert.equal(edited.sourceAgeGroup,'12');
  const refreshed={...edited,...ui.importedAge(edited,{ageGroup:'14'})};
  assert.equal(refreshed.ageGroup,'13');assert.equal(refreshed.sourceAgeGroup,'14');
  assert.equal(ui.setAge(refreshed,null).ageGroup,'14');
  assert.equal(ui.setAge(refreshed,null).manualAge,undefined);
  assert.equal(edited.bestTimes,original.bestTimes);
  for(const value of ['',0,121,'12.5','11-12','abc'])assert.throws(()=>ui.setAge(original,value),/whole number/);
});
test('athlete portraits only render initials and never load a photo manifest',()=>{
  const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
  const portrait=html.slice(html.indexOf('function swimmerPortrait('),html.indexOf('function seedUsaSwimmingProfiles('));
  assert.match(portrait,/portrait-initials/);
  assert.doesNotMatch(portrait,/<img|photoUrl/);
  assert.doesNotMatch(html,/fetch\('swimmer-photos/);
});
