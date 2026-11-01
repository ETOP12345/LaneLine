const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../rankings-engine');
const data=require('../time-standards.json');
const make=(id,age,time,division='boys')=>({id,name:id,ageGroup:String(age),division,bestTimes:[{event:'100 Free SCY',time}]});
test('rankings isolate age group, division and course, deduplicate and preserve tied places',()=>{
  const rows=[make('A',11,'1:00.00'),make('B',12,'59.00'),make('C',12,'59.00'),make('D',13,'50.00'),make('E',12,'48.00','girls')];
  const options={age:'11-12',division:'boys',course:'SCY',event:'100 free scy'};
  const result=R.rank([...rows,rows[0]],options,data);
  assert.deepEqual(result.map(e=>[e.sw.id,e.rank]),[['B',1],['C',1],['A',3]]);
  assert.equal(R.rank(rows,{...options,age:'13-14'},data)[0].sw.id,'D');
  assert.equal(R.rank(rows,{...options,course:'LCM'},data).length,0);
});
test('overall requires three rated events and ranks highest index first',()=>{
  const a=make('A',11,'1:00.00');
  a.bestTimes.push({event:'50 Free SCY',time:'27.00'},{event:'200 Free SCY',time:'2:10.00'});
  const b={...a,id:'B',name:'B',ageGroup:'12',bestTimes:a.bestTimes.map(r=>({...r}))};
  const result=R.rank([a,b,make('C',12,'49.00')],{age:'11-12',division:'boys',course:'SCY',event:''},data);
  assert.equal(result.length,2);assert.equal(result[0].score,result[1].score);assert.equal(result[1].rank,1);
});
