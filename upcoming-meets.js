(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./standards-engine'),require('./insights-engine'));
  else root.LaneLineMeets=factory(root.LaneLineStandards,root.LaneLineInsights);
})(typeof globalThis==='object'?globalThis:this,function(S,I){
  const calendar='https://www.gomotionapp.com/team/onsbcst/page/calendar';
  const agiInfo='https://www.gomotionapp.com/onsbcst/__eventform__/1610837_7da4d6e3-5f51-4299-82e3-0b0728dbb4e8.pdf';
  const agiCuts='https://www.gomotionapp.com/onsbcst/__eventform__/1597346_065d8dc8-c1e1-4065-8fdd-ea0fb83cad82.pdf';
  const cutEvents=['50 Free','100 Free','200 Free','500 Free','50 Back','100 Back','200 Back','50 Breast','100 Breast','200 Breast','50 Fly','100 Fly','200 Fly','100 IM','200 IM','400 IM'];
  // Transcribed from the SCY columns of the linked 2026-27 AGI standards.
  const cuts={
    'girls|10':['42.29','1:33.09','3:05.19','7:20.09','48.99','1:39.19',null,'51.89','1:50.89',null,'48.09','1:38.19',null,'1:40.19','3:22.79',null],
    'boys|10':['42.49','1:33.29','3:05.89','7:20.09','49.09','1:41.19',null,'53.49','1:52.69',null,'48.59','1:38.19',null,'1:40.89','3:25.99',null],
    'girls|12':['34.19','1:15.89','2:40.59','6:44.99','40.49','1:25.09','2:54.39','45.19','1:35.49','3:21.69','38.99','1:24.09','3:00.09','1:24.29','2:54.79','6:20.99'],
    'boys|12':['32.79','1:15.69','2:41.79','6:44.99','40.49','1:24.99','2:52.99','45.09','1:34.89','3:15.99','38.19','1:24.69','3:00.09','1:24.79','2:51.69','6:20.99'],
    'girls|14':['30.19','1:07.69','2:24.09','6:13.09','35.69','1:15.99','2:38.39','41.19','1:27.19','3:03.29','34.79','1:16.09','2:44.99','1:18.39','2:41.09','5:24.99'],
    'boys|14':['28.29','1:02.59','2:14.39','5:56.79','34.89','1:10.99','2:29.19','37.99','1:20.79','2:49.99','31.79','1:09.39','2:30.29','1:13.29','2:29.09','5:10.59']
  };
  const meets=[{
    id:'sockeye',name:'IST November Sockeye Invitational',start:'2026-11-14',end:'2026-11-15',
    location:'Snohomish Aquatic Center',address:'516 Maple Avenue, Snohomish, WA',course:'SCY',
    url:calendar+'#/team-events/upcoming/1767440',document:'https://www.gomotionapp.com/onsbcst/__eventform__/1610840_180d011f-0b80-455a-8320-0861f2db6d5f.pdf',
    teamDeadline:'2026-10-25',hostDeadline:'2026-11-03',format:'Timed finals only',
    rules:'Invitation required; acceptance is not guaranteed. Ages 12 and under may swim in only one session per day. Ages 11+ may swim at most three events in the main session or two in the distance session. Four total per day is a ceiling, not a recommendation.',
    sessions:[
      {date:'2026-11-14',name:'Saturday main session',min:11,max:99,limit:3,events:['50 Free','100 IM','100 Free','50 Breast','100 Back','100 Breast','100 Fly']},
      {date:'2026-11-15',name:'Sunday main session',min:11,max:99,limit:3,events:['50 Back','200 Free','200 Back','50 Fly','200 Breast','200 Fly','200 IM']},
      {date:'2026-11-14',name:'Saturday 10 & under',min:10,max:10,limit:4,events:['50 Free','50 Back','50 Breast','50 Fly','100 IM']},
      {date:'2026-11-15',name:'Sunday 10 & under',min:10,max:10,limit:4,events:['50 Free','50 Back','50 Breast','50 Fly','100 IM']}
    ]
  },{
    id:'agi',name:'November Age Group Invitational · Division 1',start:'2026-11-20',end:'2026-11-22',
    location:'Mt. Tahoma High School Pool',address:'4634 S. 74th Street, Tacoma, WA',course:'SCY',
    url:calendar+'#/team-events/upcoming/1767441',document:agiInfo,cutsDocument:agiCuts,
    teamDeadline:'2026-11-01',hostDeadline:'2026-11-10',format:'11+: prelims + finals; 10 & under: timed finals',
    rules:'Assigned clubs or invitation only. Seven events maximum: one Friday, three Saturday, three Sunday. Qualifying swims must be from September 1, 2025 through the entry deadline; no converted times. Ages 11–12 have two six-lane finals heats. Ages 13+ have three, with B/C reserved for ages 13–14. Friday is timed finals. Confirm meet-day age and entries with your coach.',
    qualifyingSince:'2025-09-01',sessions:[
      {date:'2026-11-20',name:'Friday distance · timed finals',min:11,max:14,limit:1,events:['400 IM','500 Free']},
      {date:'2026-11-20',name:'Friday distance · timed finals',min:10,max:10,limit:1,events:['500 Free']},
      {date:'2026-11-21',name:'Saturday prelims + finals',min:11,max:14,limit:3,events:['50 Fly','200 IM','100 Back','50 Breast','200 Fly','100 Free','200 Breast']},
      {date:'2026-11-22',name:'Sunday prelims + finals',min:11,max:14,limit:3,events:['50 Back','200 Free','100 Fly','200 Back','100 Breast','50 Free','100 IM']},
      {date:'2026-11-21',name:'Saturday 10 & under · timed finals',min:10,max:10,limit:3,events:['50 Fly','200 IM','100 Back','50 Breast','100 Free']},
      {date:'2026-11-22',name:'Sunday 10 & under · timed finals',min:10,max:10,limit:3,events:['50 Back','200 Free','100 Fly','100 Breast','50 Free','100 IM']}
    ]
  }];
  function recommendations(meet,sw,swimmers,data){
    const age=Number(sw.ageGroup),ratings=I.strengths(sw,swimmers,'SCY',data);
    if(age<10||age>14)return [];
    const group=age<=10?10:age<=12?12:14,table=cuts[sw.division+'|'+group];
    return meet.sessions.filter(s=>age>=s.min&&age<=s.max).map(session=>{
      const candidates=session.events.map((name,order)=>{
        const key=S.eventKey(name+' SCY'),rating=ratings.find(r=>S.eventKey(r.row.event)===key);
        if(!rating)return null;
        let row=rating.row,qualifying=true,cut=null;
        if(meet.id==='agi'){
          cut=table?.[cutEvents.indexOf(name)];
          const races=[...(sw.timeHistory||[]),...(sw.bestTimes||[])].filter(r=>S.eventKey(r.event)===key&&r.date&&new Date(r.date)>=new Date(meet.qualifyingSince)&&new Date(r.date)<=new Date(meet.hostDeadline+'T23:59:59')&&S.centiseconds(r.time)>0).sort((a,b)=>S.centiseconds(a.time)-S.centiseconds(b.time));
          row=races[0];qualifying=Boolean(row&&cut&&S.centiseconds(row.time)<=S.centiseconds(cut));
        }
        if(!row||!qualifying)return null;
        const next=S.targets(data,row,sw).filter(t=>t.available&&!t.met&&!t.reference).sort((a,b)=>a.dropSeconds-b.dropSeconds)[0];
        const dropPercent=next?next.dropSeconds/(S.centiseconds(row.time)/100)*100:null;
        const reason=next&&dropPercent<=3?`Chase ${next.label}: ${next.dropSeconds.toFixed(2)}s to drop.`:rating.total>1?`Competitive strength: #${rating.rank} of ${rating.total} saved same-age peers.`:`Build on your ${rating.level} best.`;
        return {name,event:key,row,cut,order,reason,score:(rating.peerScore??.5)*4+(rating.ratio||0)+(dropPercent!==null&&dropPercent<=3?1:0)};
      }).filter(Boolean);
      const chosen=[];
      while(chosen.length<session.limit&&candidates.length){
        candidates.sort((a,b)=>(b.score-(chosen.some(c=>Math.abs(c.order-b.order)<=1)?.65:0))-(a.score-(chosen.some(c=>Math.abs(c.order-a.order)<=1)?.65:0)));
        chosen.push(candidates.shift());
      }
      return {...session,choices:chosen.sort((a,b)=>a.order-b.order)};
    });
  }
  return {meets,recommendations,cuts,cutEvents};
});
