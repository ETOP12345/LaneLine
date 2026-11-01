const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/deploy-laneline.yml'),'utf8');
test('public deployment is skipped for private repositories',()=>{
  assert.match(workflow,/if: \$\{\{ !github\.event\.repository\.private \}\}/);
});
test('deployment includes frontend dependencies and does not require absent JS data files',()=>{
  for(const name of ['index.html','datahub-history.json','swimmer-roster.json','time-standards.json','standards-engine.js','insights-engine.js','performance.css','motion.js','swimmer-ui.js','upcoming-meets.js']){
    assert.ok(fs.existsSync(path.join(root,name)),name+' exists');
    assert.ok(workflow.includes(name),name+' is packaged');
  }
  assert.ok(workflow.includes('cp -R western-zone-dashboard/data/.'));
  assert.ok(workflow.includes('cp -R ui-media/.'));
  assert.ok(!workflow.includes('data/*.js'));
});
