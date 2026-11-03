const test=require('node:test');
const assert=require('node:assert/strict');
const ui=require('../swimmer-ui');
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
