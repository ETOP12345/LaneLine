const test=require('node:test');
const assert=require('node:assert/strict');
const I=require('../insights-engine');
const race=(time,date,meet='Meet')=>({time,date,dateValue:new Date(date),meet});

test('race log orders all swims newest first and compares only matching events',()=>{
  const groups={'50 Free SCY':[race('30.00','2026-01-01'),race('29.25','2026-02-01')],'100 Breast SCY':[race('1:15.00','2026-03-01')]};
  const rows=I.raceLog(groups);
  assert.deepEqual(rows.map(row=>row.time),['1:15.00','29.25','30.00']);
  assert.equal(rows[1].change,-.75);assert.equal(rows[0].change,null);
  assert.equal(rows[1].isBestSaved,true);assert.equal(rows[2].isBestSaved,false);
  assert.equal(rows[1].meet,'Meet');assert.equal(I.raceLog(groups),rows,'log data is cached for repeated chart interactions');
});

test('same-day races never invent an order for improvement comparisons',()=>{
  const rows=I.raceLog({'50 Free SCY':[race('30.00','2026-01-01'),race('29.00','2026-02-01'),race('29.50','2026-02-01'),race('29.25','2026-03-01')]});
  assert.equal(rows[0].change,.25);
  assert.deepEqual(rows.filter(row=>row.date==='2026-02-01').map(row=>row.change),[-1,-.5]);
});

test('race log ignores invalid results, supports tied bests, and never mutates source rows',()=>{
  const groups={'50 Free SCY':[race('DQ','2026-01-01'),race('28.00','bad date'),race('28.00','2026-02-01'),race('28.00','2026-03-01')]};
  const before=groups['50 Free SCY'].slice(),rows=I.raceLog(groups);
  assert.equal(rows.length,2);assert.ok(rows.every(row=>row.isBestSaved));
  assert.deepEqual(groups['50 Free SCY'],before);assert.equal(before[2].change,undefined);
  assert.deepEqual(I.raceLog({}),[]);
});
