const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {recordVerification}=require('../scripts/import-datahub-history');
test('profile verification saves each result and updates by stable member ID',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'laneline-verification-'));
  try{
    await fs.writeFile(path.join(dir,'roster-recheck-results.json'),'[]');
    const record={name:'Test Swimmer',candidateName:'Test Middle Swimmer',usaSwimmingMemberId:'ABCDEF12345678',ageGroup:'15',division:'boys',lsc:'PN',team:'Club',outcome:'excluded-current-age-or-LSC'};
    await recordVerification(record,dir);
    await recordVerification({...record,outcome:'needs-identity-review'},dir);
    const saved=JSON.parse(await fs.readFile(path.join(dir,'roster-recheck-results.json'),'utf8'));
    assert.equal(saved.length,1);assert.equal(saved[0].outcome,'needs-identity-review');
    assert.equal(saved[0].candidateName,record.candidateName);assert.ok(saved[0].checkedAt);
    await assert.rejects(recordVerification({...record,usaSwimmingMemberId:'bad'},dir),/Invalid/);
    await recordVerification({name:'Unresolved Name',candidateName:'Unresolved Name',division:'girls',outcome:'needs-identity-review'},dir);
    assert.equal(JSON.parse(await fs.readFile(path.join(dir,'roster-recheck-results.json'),'utf8')).length,2);
  }finally{
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));
    await fs.rm(dir,{recursive:true,force:true});
  }
});
