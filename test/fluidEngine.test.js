const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const createFluid=require('../fluid-engine');
test('fluid engine gracefully rejects a canvas without WebGL',()=>{
  assert.throws(()=>createFluid({clientWidth:800,clientHeight:400,getContext:()=>null}),/WebGL unavailable/);
});
test('deferred warm-up does no GPU work before its scheduled turn and can be cancelled',()=>{
  const queue=[];let contexts=0,failures=0;
  const canvas={clientWidth:800,clientHeight:400,getContext(){contexts++;return null;}};
  const cancel=createFluid.createDeferred(canvas,()=>assert.fail('unsupported WebGL'),()=>failures++,fn=>queue.push(fn));
  assert.equal(contexts,0);assert.equal(queue.length,1);
  cancel();queue.shift()();assert.equal(contexts,0);assert.equal(failures,0);
  createFluid.createDeferred(canvas,()=>assert.fail('unsupported WebGL'),()=>failures++,fn=>queue.push(fn));
  assert.equal(contexts,0);queue.shift()();assert.ok(contexts>0);assert.equal(failures,1);
});
test('vendored fluid engine retains its license, has a fixed blue palette and no demo side effects',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../fluid-engine.js'),'utf8');
  assert.ok(source.includes('Copyright (c) 2017 Pavel Dobryakov'));
  assert.ok(source.includes('{r:.11,g:.3,b:.42}'));
  assert.ok(source.includes('SIM_RESOLUTION:64,DYE_RESOLUTION:256'));
  assert.ok(source.includes('laneCrossings(coord.x, vUv.x)'));
  assert.ok(source.includes('laneCrossings(point.x, vUv.x)'));
  assert.ok(source.includes('advectionProgram.uniforms.laneRetention, 0.62'));
  assert.doesNotMatch(source,/requestAnimationFrame\((?:update|tick)\)|new Image|fetch\(|ga\(|window\.open|dat\.GUI|addEventListener/);
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.ok(html.indexOf('src="fluid-engine.js"')<html.indexOf('src="motion.js"'));
  const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/deploy-laneline.yml'),'utf8');
  assert.ok(workflow.includes('motion.js fluid-engine.js'));
});
