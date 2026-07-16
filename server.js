const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

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
    const key = `${row.event}|${row.time}`;
    if (!deduped.has(key)) deduped.set(key, row);
  });
  return [...deduped.values()].sort((a, b) => a.event.localeCompare(b.event));
}

function toLaneLineBestTime(row) {
  const [distance, stroke, course] = String(row.eventCode || "").split(/\s+/);
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
