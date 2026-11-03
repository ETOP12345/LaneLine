const test=require('node:test');
const assert=require('node:assert/strict');
const {audit}=require('../scripts/audit-swimmer-roster');
const standards=require('../time-standards.json');
test('coverage audit does not confuse an empty queue or historical A time with complete discovery',()=>{
  const roster={swimmers:[{name:'Alex Wang',usaSwimmingMemberId:'known',ageGroup:'12'}]};
  const candidate={name:'Alex Middle Wang',gender:'M',age:12,team:'Club',personKey:123,swims:[{event:'100 Free',course:'SCY',time:'40.00'}]};
  const result=audit(roster,{lastUpdated:'2026-08-25',swimmers:[candidate,{...candidate,personKey:456}]},standards,{});
  assert.equal(result.complete,false);assert.equal(result.discoveryCandidates.length,1);
  assert.equal(result.discoveryCandidates[0].status,'needs-current-profile-verification');
  assert.equal(result.discoveryCandidates[0].possibleNameMatches[0].name,'Alex Wang');
  assert.equal(result.existingProfilesToRecheck.length,1);
});
test('live resolved identities are excluded from pending rechecks and discovery',()=>{
  const sw={name:'Andy Gaiovyi',usaSwimmingMemberId:'id',ageGroup:'12'};
  const check={...sw,division:'boys',outcome:'verified-and-imported'};
  const result=audit({swimmers:[sw]},{swimmers:[]},standards,{},[check]);
  assert.equal(result.existingProfilesToRecheck.length,0);
  assert.equal(result.liveVerificationResults.length,1);
  const unresolved=audit({swimmers:[sw]},{swimmers:[]},standards,{},[{...check,outcome:'needs-identity-review'}]);
  assert.equal(unresolved.existingProfilesToRecheck.length,1);
});
test('middle-name aliases require matching histories in two different events',()=>{
  const swims=[{event:'50 Free',course:'SCY',time:'25.00',date:'2026-01-01'},{event:'100 Free',course:'SCY',time:'55.00',date:'2026-01-02'}];
  const source={swimmers:[{name:'Alex Middle Wang',gender:'M',age:12,team:'Club',personKey:123,swims}]};
  const roster={swimmers:[{name:'Alex Wang',usaSwimmingMemberId:'known',ageGroup:'12'}]};
  const result=audit(roster,source,standards,{known:swims});
  assert.equal(result.discoveryCandidates.length,0);assert.equal(result.linkedAliases.length,1);
  assert.equal(result.existingProfilesToRecheck.length,1,'history matching is not a live age verification');
  assert.equal(audit(roster,source,standards,{known:[swims[0]]}).discoveryCandidates.length,1);
});
