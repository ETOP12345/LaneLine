const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {queue,saveRecord}=require('../scripts/import-swimmer-photos');
test('photo queue excludes checked profiles and saved portraits',async()=>{
  const q=await queue();
  const photos=require('../swimmer-photos.json');
  const progress=require('../swimmer-photo-progress.json');
  assert.ok(q.pending.every(sw=>/^[A-F0-9]{14}$/.test(sw.id)&&sw.name&&!photos[sw.id]&&!progress[sw.id]));
  assert.equal(new Set(q.pending.map(sw=>sw.id)).size,q.pending.length);
  for(const file of Object.values(photos)){
    assert.match(file,/^ui-media\/swimmers\/[A-F0-9]{14}\.jpg$/);
    const bytes=await fs.readFile(path.join(__dirname,'..',file));
    assert.equal(bytes[0],0xff);assert.equal(bytes[1],0xd8);
  }
});
test('photo importer rejects mismatched identities and arbitrary local files',async()=>{
  await assert.rejects(saveRecord({id:'not-an-id',name:'Unknown'}),/Unverified swimmer identity/);
  const sw=require('../swimmer-roster.json').swimmers[0];
  await assert.rejects(saveRecord({id:sw.usaSwimmingMemberId,name:sw.name,download:path.join(__dirname,'../index.html')}),/downloaded profile JPEG/);
});
