const fs = require('node:fs/promises');
const path = require('node:path');
const { fetchUsaSwimmingTimeHistory } = require('../server');

const root = path.resolve(__dirname, '..');

function validRow(row) {
  return /^\d+ (Free|Back|Breast|Fly|IM) (SCY|LCM|SCM)$/.test(row.event || '') &&
    /^\d+(?::\d{2})?\.\d{2}[a-z]?$/i.test(row.time || '') &&
    Number.isFinite(Date.parse(row.date)) && Boolean(row.meet);
}

function mergeRows(saved, fresh) {
  if (!fresh.length || fresh.some(row => !validRow(row))) {
    throw new Error('USA Swimming returned empty or invalid history; saved history was preserved.');
  }
  const key = row => [row.event, row.time, new Date(row.date).toISOString().slice(0, 10), row.meet].join('|');
  const merged = new Map(saved.map(row => [key(row), row]));
  fresh.forEach(row => merged.set(key(row), row));
  return [...merged.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

async function refresh({ directory = root, fetchHistory = fetchUsaSwimmingTimeHistory,
  requestDelayMs = fetchHistory === fetchUsaSwimmingTimeHistory ? 15000 : 0,
  pause = ms => new Promise(resolve => setTimeout(resolve,ms)) } = {}) {
  const historyPath = path.join(directory, 'datahub-history.json');
  const statusPath = path.join(directory, 'datahub-refresh-status.json');
  const histories = JSON.parse(await fs.readFile(historyPath, 'utf8'));
  const checkedAt = new Date().toISOString();
  let previous = {};
  try { previous = JSON.parse(await fs.readFile(statusPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const swimmers = {};
  let failures = 0;
  let stopReason='';
  let attempted=0;
  for (const memberId of Object.keys(histories)) {
    if(stopReason){
      swimmers[memberId]={...previous.swimmers?.[memberId],status:'deferred',savedRows:histories[memberId].length,
        note:'Refresh deferred after upstream authentication or rate-limit response. Saved history was preserved.'};
      continue;
    }
    if(attempted++ && requestDelayMs>0)await pause(requestDelayMs);
    try {
      const fresh = await fetchHistory(memberId);
      const rows = mergeRows(histories[memberId], fresh);
      histories[memberId] = rows;
      swimmers[memberId] = {
        ...previous.swimmers?.[memberId],
        status: 'updated', checkedAt, lastSuccessAt: checkedAt,
        fetchedRows: fresh.length, savedRows: rows.length, newestSwim: rows[0].date,
        courses: [...new Set(fresh.map(row => row.course))]
      };
    } catch (error) {
      failures++;
      swimmers[memberId] = {
        ...previous.swimmers?.[memberId],
        status: 'failed', checkedAt,
        lastSuccessAt: previous.swimmers?.[memberId]?.lastSuccessAt || null,
        savedRows: histories[memberId].length,
        error: /403|401/.test(error.message)
          ? 'USA Swimming denied access. Configure or renew USA_SWIMMING_AUTHORIZATION in GitHub Actions secrets.'
          : 'USA Swimming history could not be retrieved. Saved history was preserved.'
      };
      console.error(`Swimmer ${memberId}: ${swimmers[memberId].error}`);
      if(/\b(401|403|429)\b/.test(error.message))stopReason=error.message;
    }
  }
  // Never erase historical swims on an upstream failure or a truncated response.
  const tempPath = historyPath + '.tmp';
  await fs.writeFile(tempPath, JSON.stringify(histories, null, 2) + '\n');
  await fs.rename(tempPath, historyPath);
  await fs.writeFile(statusPath, JSON.stringify({
    status: failures ? 'failed' : 'updated', checkedAt, swimmers
  }, null, 2) + '\n');
  return failures;
}

module.exports = { refresh, mergeRows, validRow };
if (require.main === module) {
  refresh().then(failures => { process.exitCode = failures ? 1 : 0; })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
