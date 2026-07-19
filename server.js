const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { createVideoAnalysisRouter } = require("./videoAnalysis");

const root = __dirname;
const preferredPort = Number(process.argv[2] || process.env.PORT || 5180);
const usaSwimmingMemberId = "9DCE8A4B52EF4A";
const usaSwimmingEvents = [
  [25, "FR"], [50, "FR"], [100, "FR"], [200, "FR"], [400, "FR"], [500, "FR"], [800, "FR"], [1000, "FR"], [1500, "FR"], [1650, "FR"],
  [25, "BK"], [50, "BK"], [100, "BK"], [200, "BK"],
  [25, "BR"], [50, "BR"], [100, "BR"], [200, "BR"],
  [25, "FL"], [50, "FL"], [100, "FL"], [200, "FL"],
  [100, "IM"], [200, "IM"], [400, "IM"]
];
const handleVideoAnalysis = createVideoAnalysisRouter();

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || "localhost";
  const requestUrl = new URL(req.url, `http://${host}`);
  const urlPath = decodeURIComponent(requestUrl.pathname);

  if (urlPath.startsWith("/api/video-analysis")) {
    const handled = await handleVideoAnalysis(req, res, requestUrl);
    if (handled) return;
  }

  if (urlPath === "/api/usa-swimming/best-times") {
    const memberId = requestUrl.searchParams.get("memberId") || usaSwimmingMemberId;
    try {
      const bestTimes = await fetchUsaSwimmingBestTimes(memberId);
      sendJson(res, 200, { memberId, bestTimes, checkedAt: new Date().toISOString() });
    } catch (error) {
      sendJson(res, 502, { error: "Could not refresh USA Swimming best times.", details: error.message });
    }
    return;
  }

  if (urlPath === "/api/usa-swimming/time-history") {
    const memberId = requestUrl.searchParams.get("memberId") || usaSwimmingMemberId;
    try {
      const timeHistory = await fetchUsaSwimmingTimeHistory(memberId);
      sendJson(res, 200, { memberId, timeHistory, checkedAt: new Date().toISOString() });
    } catch (error) {
      sendJson(res, 502, { error: "Could not refresh USA Swimming time history.", details: error.message });
    }
    return;
  }

  if (urlPath === "/api/swimcloud/best-times") {
    const profile = requestUrl.searchParams.get("profile");
    if (!profile) {
      sendJson(res, 400, { error: "Missing Swimcloud profile ID or URL." });
      return;
    }
    try {
      const bestTimes = await fetchSwimcloudBestTimes(profile);
      sendJson(res, 200, { profile: normalizeSwimcloudProfile(profile), bestTimes, checkedAt: new Date().toISOString() });
    } catch (error) {
      sendJson(res, 502, { error: "Could not refresh Swimcloud best times.", details: error.message });
    }
    return;
  }

  const relativePath = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store, max-age=0"
    });
    res.end(data);
  });
});

function sendJson(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0"
  });
  res.end(JSON.stringify(value));
}

function makeDeviceId() {
  const raw = Buffer.from(`Win32 - Google Inc. - LaneLine - ${Date.now()}`).toString("base64");
  return raw.slice(0, 15) + raw.slice(0, 5) + raw.slice(15);
}

function requestJson(url, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const parsed = new URL(url);
    const req = https.request({
      method: payload ? "POST" : "GET",
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": payload ? Buffer.byteLength(payload) : 0,
        "Device-Id": makeDeviceId(),
        "AppName": "DataHub",
        "Usas-Sub-Id": "Anonymous"
      }
    }, (response) => {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { data += chunk; });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(data || `USA Swimming returned ${response.statusCode}`));
          return;
        }
        try {
          resolve(data ? JSON.parse(data) : null);
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error("USA Swimming request timed out."));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function requestText(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      method: "GET",
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
      }
    }, (response) => {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { data += chunk; });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(data || `Swimcloud returned ${response.statusCode}`));
          return;
        }
        resolve(data);
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error("Swimcloud request timed out."));
    });
    req.end();
  });
}

async function fetchUsaSwimmingBestTimes(memberId) {
  const requests = usaSwimmingEvents.map(([distance, strokeAbbreviation]) =>
    requestJson("https://times-api.usaswimming.org/swims/TimesSearch/BestTimes", {
      memberId,
      distance,
      strokeAbbreviation
    }).catch(() => [])
  );
  const results = (await Promise.all(requests)).flat().filter(Boolean);
  const rows = results.map(toLaneLineBestTime);
  const deduped = new Map();
  rows.forEach(row => {
    const key = `${row.event}|${row.time}|${row.date}|${row.meet}`;
    if (!deduped.has(key)) deduped.set(key, row);
  });
  return [...deduped.values()].sort((a, b) =>
    a.event.localeCompare(b.event) ||
    new Date(a.date || 0) - new Date(b.date || 0) ||
    a.time.localeCompare(b.time)
  );
}

async function fetchUsaSwimmingTimeHistory(memberId) {
  const filterBodies = [
    { memberId, page: 1, pageSize: 500 },
    { memberId, pageNumber: 1, pageSize: 500 },
    { memberIds: [memberId], page: 1, pageSize: 500 },
    { swimmerId: memberId, page: 1, pageSize: 500 },
    { memberId, bestTimesOnly: false, page: 1, pageSize: 500 },
    { memberId, includeAllTimes: true, page: 1, pageSize: 500 }
  ];
  for (const body of filterBodies) {
    try {
      const rows = await requestJson("https://times-api.usaswimming.org/swims/TimesSearch/GetAllTimesForFilters", body);
      const mapped = normalizeTimeRows(rows, "USA Swimming");
      if (mapped.length) return mapped;
    } catch (error) {}
  }
  throw new Error("USA Swimming all-times endpoint did not return history rows.");
}

function toLaneLineBestTime(row) {
  const [distance, stroke, course] = String(row.eventCode || row.event || "").split(/\s+/);
  const strokeName = { FR: "Free", BK: "Back", BR: "Breast", FL: "Fly", IM: "IM" }[stroke] || stroke;
  return {
    event: `${distance} ${strokeName} ${course}`,
    time: row.swimTime || "",
    meet: row.meetName || "",
    date: row.swimDate || "",
    source: "USA Swimming",
    course: course || ""
  };
}

function normalizeTimeRows(rows, source) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => toLaneLineTimeRow(row, source))
    .filter(row => row.event && row.time)
    .sort((a, b) =>
      a.event.localeCompare(b.event) ||
      new Date(a.date || 0) - new Date(b.date || 0) ||
      a.time.localeCompare(b.time)
    );
}

function toLaneLineTimeRow(row, source) {
  const rawEvent = row.eventCode || row.event || row.eventName || row.eventDescription || row.swimEvent || "";
  const parts = String(rawEvent).trim().split(/\s+/);
  const distance = row.distance || parts[0] || "";
  const strokeCode = row.strokeAbbreviation || row.stroke || parts[1] || "";
  const course = row.course || row.eventCourse || row.poolCourse || parts.find(part => /^(SCY|LCM|SCM)$/i.test(part)) || "";
  const strokeName = {
    FR: "Free", FREE: "Free", FREESTYLE: "Free",
    BK: "Back", BACK: "Back", BACKSTROKE: "Back",
    BR: "Breast", BREAST: "Breast", BREASTSTROKE: "Breast",
    FL: "Fly", FLY: "Fly", BUTTERFLY: "Fly",
    IM: "IM"
  }[String(strokeCode).toUpperCase()] || strokeCode;
  const event = rawEvent && /\b(SCY|LCM|SCM)\b/i.test(rawEvent)
    ? formatEventName(rawEvent)
    : [distance, strokeName, course].filter(Boolean).join(" ");
  return {
    event,
    time: row.swimTime || row.time || row.resultTime || row.finalTime || "",
    meet: row.meetName || row.meet || row.competitionName || "",
    date: row.swimDate || row.date || row.meetDate || row.startDate || "",
    source,
    course: String(course || "").toUpperCase()
  };
}

function formatEventName(eventName) {
  return String(eventName)
    .replace(/\bFR\b/g, "Free")
    .replace(/\bBK\b/g, "Back")
    .replace(/\bBR\b/g, "Breast")
    .replace(/\bFL\b/g, "Fly")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchSwimcloudBestTimes(profile) {
  const swimmerId = normalizeSwimcloudProfile(profile);
  const html = await requestText(`https://www.swimcloud.com/swimmer/${encodeURIComponent(swimmerId)}/times/`);
  return parseSwimcloudTimes(html);
}

function normalizeSwimcloudProfile(profile) {
  const value = String(profile || "").trim();
  const match = value.match(/swimcloud\.com\/swimmer\/(\d+)/i) || value.match(/^(\d+)$/);
  if (!match) throw new Error("Use a Swimcloud swimmer URL or numeric swimmer ID.");
  return match[1];
}

function parseSwimcloudTimes(html) {
  const rows = [];
  const rowMatches = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  rowMatches.forEach(rowHtml => {
    const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(match => cleanHtml(match[1]))
      .filter(Boolean);
    const parsed = parseSwimcloudCells(cells);
    if (parsed) rows.push(parsed);
  });
  const deduped = new Map();
  rows.forEach(row => {
    const key = `${row.event}|${row.time}|${row.date}|${row.meet}`;
    if (!deduped.has(key)) deduped.set(key, row);
  });
  return [...deduped.values()].sort((a, b) =>
    a.event.localeCompare(b.event) ||
    new Date(a.date || 0) - new Date(b.date || 0) ||
    a.time.localeCompare(b.time)
  );
}

function parseSwimcloudCells(cells) {
  const course = cells.find(cell => /^(SCY|LCM|SCM)$/i.test(cell))?.toUpperCase();
  const time = cells.find(cell => /^\d{1,2}:?\d{1,2}\.\d{2}[A-Z]?$/i.test(cell));
  const event = cells.find(cell => /^\d+\s+(Free|Back|Breast|Fly|IM|Freestyle|Backstroke|Breaststroke|Butterfly)/i.test(cell));
  if (!course || !time || !event) return null;
  const eventName = `${event.replace(/\bFreestyle\b/i, "Free").replace(/\bBackstroke\b/i, "Back").replace(/\bBreaststroke\b/i, "Breast").replace(/\bButterfly\b/i, "Fly")} ${course}`;
  const meet = cells.find(cell => cell !== event && cell !== time && cell !== course && /\d{4}|Invite|Open|Champ|Meet|Classic|Regional|Sectional|Cup/i.test(cell)) || "";
  const date = cells.find(cell => /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{1,2}\/\d{1,2}\/\d{2,4})/i.test(cell)) || "";
  return { event: eventName, time, meet, date, source: "Swimcloud", course };
}

function cleanHtml(value) {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function listen(port) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE") listen(port + 1);
    else throw error;
  });
  server.listen(port, () => {
    console.log(`Lane Line is available at http://localhost:${port}`);
  });
}

listen(preferredPort);
