const test=require('node:test');
const assert=require('node:assert/strict');
const {candidates}=require('../scripts/prepare-browser-refresh');
test('refresh scope requires top-5 event ranks, includes ties, and excludes AA-only swimmers',()=>{
  const profiles=Array.from({length:9},(_,i)=>({name:'Swimmer '+i,usaSwimmingMemberId:String(i),division:'boys',ageGroup:'12',lsc:'PN',bestTimes:[{event:'100 Free SCY',time:i<4?'54.00':i<6?'55.00':'56.00'}]}));
  profiles.push({name:'AA swimmer',usaSwimmingMemberId:'aa',division:'girls',ageGroup:'12',lsc:'PN',bestTimes:[{event:'100 Free SCY',time:'55.00'}]});
  profiles.push({...profiles[0],name:'Inactive',usaSwimmingMemberId:'inactive',activePns:false});
  const data={motivational:{'boys|11-12|100 free scy':{AA:'56.00'},'girls|11-12|100 free scy':{AA:'56.00'}}};
  const selected=candidates(profiles,{},data);
  assert.equal(selected.length,7);
  assert.ok(selected.find(s=>s.memberId==='4').reasons.includes('Saved PNS #5 100 free scy'));
  assert.ok(selected.find(s=>s.memberId==='5').reasons.includes('Saved PNS #5 100 free scy'));
  assert.ok(selected.find(s=>s.memberId==='aa').reasons.includes('AA or faster'));
  assert.ok(!selected.some(s=>['6','7','8','inactive'].includes(s.memberId)));
});
