const test=require('node:test');
const assert=require('node:assert/strict');
const I=require('../insights-engine');
const race=(time,date,meet='Meet')=>({time,date,dateValue:new Date(date),meet});

test('PB spotlight celebrates a real improvement over the prior best, not a slower recent race',()=>{
  const groups={'50 Free SCY':[race('30.00','2026-01-01'),race('32.00','2026-02-01'),race('29.00','2026-03-01')]};
  const spotlight=I.personalBestSpotlight(groups);
  assert.equal(spotlight.time,'29.00');assert.equal(spotlight.change,-1);
  assert.equal(I.personalBestSpotlight(groups),spotlight);
  assert.equal(I.personalBestSpotlight({'50 Free SCY':[race('30.00','2026-01-01')]}),null);
  assert.equal(I.personalBestSpotlight({'50 Free SCY':[race('30.00','2026-01-01'),race('31.00','2026-02-01')]}),null);
});

test('race calendar supports leap years and counts only saved race days in the chosen year',()=>{
  const rows=[{stamp:new Date(2024,1,29).getTime()},{stamp:new Date(2024,1,29).getTime()},{stamp:new Date(2025,0,1).getTime()}];
  const months=I.raceCalendar(rows,2024);
  assert.equal(months.length,12);assert.equal(months[1].days.length,29);
  assert.equal(months[1].days[28].count,2);assert.equal(months[1].days[28].key,'2024-02-29');
  assert.equal(months[1].offset,new Date(2024,1,1).getDay());
  assert.equal(months.flatMap(month=>month.days).reduce((sum,day)=>sum+day.count,0),2);
  assert.equal(I.raceCalendar([],2025)[1].days.length,28);
  assert.deepEqual(I.raceCalendar(rows,NaN),[]);
});

test('date-only meet dates stay on their calendar day and reject invalid dates',()=>{
  const date=I.raceDate('2026-10-04');
  assert.equal(date.getFullYear(),2026);assert.equal(date.getMonth(),9);assert.equal(date.getDate(),4);assert.equal(date.getHours(),0);
  assert.equal(I.raceDate('2026-02-30'),null);assert.equal(I.raceDate('not a date'),null);
  assert.equal(I.dayKey(date),'2026-10-04');
});

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
