const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {importSnapshot} = require('../scripts/import-datahub-history');

test('verified import preserves history, deduplicates, and records manual status', async () => {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'laneline-import-'));
  try {
    await fs.writeFile(path.join(directory,'datahub-history.json'),JSON.stringify({ethan:[]}));
    await fs.writeFile(path.join(directory,'datahub-refresh-status.json'),JSON.stringify({swimmers:{}}));
    const snapshot={events:['50 BR SCY','400 FR SCM'],meets:['Fall Invite'],swimmers:{ethan:[[0,'30.91',0,'10/25/2026'],[1,'4:49.92',0,'10/18/2026']]}};
    assert.equal((await importSnapshot(snapshot,directory)).ethan.addedRows,2);
    assert.equal((await importSnapshot(snapshot,directory)).ethan.addedRows,0);
    const saved=JSON.parse(await fs.readFile(path.join(directory,'datahub-history.json'),'utf8'));
    assert.equal(saved.ethan[0].event,'50 Breast SCY');
    assert.equal(saved.ethan[1].course,'SCM');
    const status=JSON.parse(await fs.readFile(path.join(directory,'datahub-refresh-status.json'),'utf8'));
    assert.equal(status.swimmers.ethan.status,'manual');
    const before=JSON.stringify(saved);
    await assert.rejects(importSnapshot({...snapshot,swimmers:{unknown:snapshot.swimmers.ethan}},directory));
    assert.equal(JSON.stringify(JSON.parse(await fs.readFile(path.join(directory,'datahub-history.json'),'utf8'))),before);
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});
