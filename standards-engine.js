(function (root, factory) {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  else root.LaneLineStandards = engine;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  function eventKey(value) {
    return String(value || '').toLowerCase().replace(/freestyle/g,'free').replace(/backstroke/g,'back')
      .replace(/breaststroke/g,'breast').replace(/butterfly/g,'fly').replace(/\s+/g,' ').trim();
  }
  function centiseconds(value) {
    const match = String(value || '').trim().match(/^(?:(\d+):)?(\d{1,2})\.(\d{2})[a-z]?$/i);
    if (!match || (match[1] && Number(match[2]) >= 60)) return NaN;
    return ((Number(match[1] || 0) * 60 + Number(match[2])) * 100) + Number(match[3]);
  }
  function ageBounds(value) {
    const text = String(value || '').toLowerCase();
    if (/^10\s*&\s*u$/.test(text)) return [0,10];
    const match = text.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    return match ? [Number(match[1]),Number(match[2] || match[1])] : null;
  }
  function groupFor(value) {
    const age = ageBounds(value);
    if (!age) return null;
    for (const [min,max,label] of [[0,10,'10&u'],[11,12,'11-12'],[13,14,'13-14'],[15,16,'15-16'],[17,18,'17-18']]) {
      if (age[0]>=min && age[1]<=max) return label;
    }
    return null;
  }
  function division(swimmer) {return swimmer.division === 'boys' ? 'boys' : 'girls';}
  function motivationalCuts(data, event, swimmer) {
    return data.motivational[`${division(swimmer)}|${groupFor(swimmer.ageGroup)}|${eventKey(event)}`] || null;
  }
  function meetCut(meet, event, swimmer) {
    const age = ageBounds(swimmer.ageGroup);
    if (!age || age[0] < (meet.minAge ?? 0) || age[1] > (meet.maxAge ?? Infinity)) return null;
    let group = 'open';
    if (meet.ageType === 'age-group') group = groupFor(swimmer.ageGroup);
    if (meet.ageType === 'single-age') {
      if (age[1] <= 10) group = '10&u';
      else if (age[0] >= 15 && age[1] <= 18) group = '15-18';
      else if (age[0] === age[1]) group = String(age[0]);
      else return null;
    }
    return meet.cuts[`${division(swimmer)}|${group}|${eventKey(event)}`] || null;
  }
  function targets(data, row, swimmer) {
    const swim = centiseconds(row.time);
    const rows = data.meets.map(meet => ({
      id:meet.id,label:meet.label,edition:meet.edition,cut:meetCut(meet,row.event,swimmer),
      reference:Boolean(meet.reference),sourceUrl:meet.sourceUrl,note:meet.note || '',kind:'meet'
    }));
    const cuts = motivationalCuts(data,row.event,swimmer);
    for (const label of ['BB','A','AA','AAA','AAAA']) {
      if (cuts?.[label]) rows.push({id:`nat-${label}`,label:`Nat. ${label}`,edition:data.motivationalSource.edition,
        cut:cuts[label],kind:'motivational',sourceUrl:data.motivationalSource.sourceUrl,reference:false});
    }
    return rows.map(target => {
      const cut = centiseconds(target.cut);
      const available = Number.isFinite(cut) && Number.isFinite(swim);
      const drop = available ? Math.max(0,swim-cut) : null;
      return {...target,seconds:available ? cut/100 : null,dropSeconds:drop===null ? null : drop/100,
        met:available && drop===0,available};
    }).sort((a,b)=>(b.seconds ?? -Infinity)-(a.seconds ?? -Infinity)||a.label.localeCompare(b.label));
  }
  function nextTarget(data,row,swimmer) {
    return targets(data,row,swimmer).find(target=>target.available&&!target.met) || null;
  }
  return {eventKey,centiseconds,ageBounds,groupFor,motivationalCuts,meetCut,targets,nextTarget};
});
