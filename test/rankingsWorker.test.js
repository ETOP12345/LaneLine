const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
test('ranking and relay worker computes results without a DOM and preserves request IDs',()=>{
  const messages=[],context=vm.createContext({self:{postMessage(message){messages.push(message);}}});
  context.importScripts=(...names)=>names.forEach(name=>vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),context));
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../rankings-worker.js'),'utf8'),context);
  context.self.onmessage({data:{id:7,swimmers:[],standards:{},course:'SCY'}});
  assert.equal(messages[0].id,7);assert.equal(messages[0].data.course,'SCY');
  assert.ok(messages[0].data.relays);
});
