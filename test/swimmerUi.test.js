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
test('photo URLs reject executable, blob, and unsafe paths',()=>{
  assert.equal(ui.photoUrl('javascript:alert(1)'),'');
  assert.equal(ui.photoUrl('blob:https://example.com/id'),'');
  assert.equal(ui.photoUrl('ui-media/swimmers/../../private'),'');
  assert.equal(ui.photoUrl('ui-media/swimmers/72B200B0F3C44C.jpg'),'ui-media/swimmers/72B200B0F3C44C.jpg');
});
