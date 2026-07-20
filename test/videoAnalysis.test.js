const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const { analysisSchema, createVideoAnalysisRouter, focusRegionForNote, selectFrames, validateVideoMetadata, validateUploadedVideo, DEFAULT_CONFIG } = require('../videoAnalysis');

function createResponse() {
  return {
    status: null,
    headers: {},
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(value) { this.body = value || ''; }
  };
}

test('selectFrames chooses clear, distinct frames across a 60 second clip', () => {
  const frames = Array.from({ length: 360 }, (_, index) => ({
    path: `frame_${index}.jpg`,
    timestampSeconds: index / 6,
    thumbnail: Uint8Array.from({ length: 16 }, (_, pixel) => (index * 47 + pixel * 83 + index * pixel * 11) % 256),
    sharpness: index % 12 === 0 ? 500 : 10,
    contrast: 100
  }));
  const selected = selectFrames(frames, 60, 30);
  assert.equal(selected.length, 30);
  assert.ok(selected[0].timestampSeconds < 2);
  assert.ok(selected.at(-1).timestampSeconds >= 58);
  assert.equal(new Set(selected.map(frame => frame.timestampSeconds)).size, 30);
  assert.ok(selected.every((frame, index) => index === 0 || frame.timestampSeconds > selected[index - 1].timestampSeconds));
});

test('selectFrames rejects a sharper duplicate when a clear distinct alternative exists', () => {
  const black = new Uint8Array(16).fill(0);
  const white = new Uint8Array(16).fill(255);
  const frames = [
    { path: 'first-sharp.jpg', timestampSeconds: 0, thumbnail: black, sharpness: 1000, contrast: 100 },
    { path: 'first-soft.jpg', timestampSeconds: 1, thumbnail: white, sharpness: 1, contrast: 100 },
    { path: 'duplicate-sharp.jpg', timestampSeconds: 2, thumbnail: black, sharpness: 1000, contrast: 100 },
    { path: 'distinct-clear.jpg', timestampSeconds: 3, thumbnail: white, sharpness: 100, contrast: 100 }
  ];
  assert.deepEqual(selectFrames(frames, 4, 2).map(frame => frame.path), ['first-sharp.jpg', 'distinct-clear.jpg']);
});

test('selectFrames reduces repeated short-clip frames while retaining temporal coverage', () => {
  const same = new Uint8Array(16).fill(64);
  const frames = Array.from({ length: 12 }, (_, index) => ({
    path: `short_${index}.jpg`,
    timestampSeconds: index / 6,
    thumbnail: same,
    sharpness: index,
    contrast: 50
  }));
  const selected = selectFrames(frames, 2, 30);
  assert.equal(selected.length, 6);
  assert.ok(selected.length < frames.length);
  assert.ok(selected.at(-1).timestampSeconds >= 10 / 6);
});

test('focusRegionForNote crops positional lane instructions', () => {
  assert.equal(focusRegionForNote('Focus on blue cap in bottom lane').label, 'bottom-lane focus');
  assert.equal(focusRegionForNote('Swimmer in the upper lane').label, 'top-lane focus');
  assert.equal(focusRegionForNote('middle lane, red cap').label, 'middle-lane focus');
  assert.equal(focusRegionForNote('blue cap only'), null);
});

test('validateVideoMetadata rejects over-duration clips', () => {
  assert.throws(() => validateVideoMetadata({ durationSeconds: 61, width: 1280, height: 720 }, { maxVideoDurationSeconds: 60, minVideoHeight: 480 }), /60 seconds/);
});

test('validateUploadedVideo accepts mp4 uploads', () => {
  assert.equal(validateUploadedVideo({ filename: 'swim.mp4', contentType: 'video/mp4', data: Buffer.alloc(1024) }, { maxVideoSizeMb: 50 }), '');
});

test('validateUploadedVideo rejects non-video extensions', () => {
  assert.match(validateUploadedVideo({ filename: 'notes.txt', contentType: 'text/plain', data: Buffer.alloc(1024) }, { maxVideoSizeMb: 50 }), /MP4/);
});

test('successful video uploads are handled without falling through to static routing', async () => {
  const boundary = 'lane-line-test-boundary';
  const body = Buffer.from([
    `--${boundary}\r\nContent-Disposition: form-data; name="focusNote"\r\n\r\nlane 4, blue cap\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="swim.mp4"\r\nContent-Type: video/mp4\r\n\r\n`,
    'fake-video-bytes\r\n',
    `--${boundary}--\r\n`
  ].join(''), 'binary');
  const req = Readable.from([body]);
  req.method = 'POST';
  req.headers = { 'content-type': `multipart/form-data; boundary=${boundary}` };
  const response = createResponse();
  const router = createVideoAnalysisRouter(DEFAULT_CONFIG, { processAnalysis: async (_analysis, file) => fsp.rm(file.uploadDir, { recursive: true, force: true }) });

  assert.equal(await router(req, response, new URL('http://localhost/api/video-analysis')), true);
  assert.equal(response.status, 202);
  assert.match(response.body, /"status":"queued"/);
  await new Promise(resolve => setImmediate(resolve));
});

test('access code creates a secure session cookie and protects analysis routes', async () => {
  const config = { ...DEFAULT_CONFIG, accessCode: 'lane-secret', sessionSecret: 'session-secret' };
  const router = createVideoAnalysisRouter(config);
  const unauthorizedReq = Readable.from([]);
  unauthorizedReq.method = 'GET';
  unauthorizedReq.headers = {};
  const unauthorizedRes = createResponse();
  await router(unauthorizedReq, unauthorizedRes, new URL('http://localhost/api/video-analysis/missing'));
  assert.equal(unauthorizedRes.status, 401);

  const sessionReq = Readable.from([Buffer.from(JSON.stringify({ accessCode: 'lane-secret' }))]);
  sessionReq.method = 'POST';
  sessionReq.headers = { 'content-type': 'application/json', 'x-forwarded-proto': 'https' };
  const sessionRes = createResponse();
  await router(sessionReq, sessionRes, new URL('https://example.com/api/video-analysis/session'));
  assert.equal(sessionRes.status, 200);
  assert.match(sessionRes.headers['Set-Cookie'], /HttpOnly/);
  assert.match(sessionRes.headers['Set-Cookie'], /Secure/);
});

test('analysis schema is strict for the response and nested recommendation objects', () => {
  const schema = analysisSchema();
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.required.includes('detected_camera_angle'));
  assert.ok(!schema.required.includes('stroke_evidence'));
  assert.deepEqual(schema.properties.detected_stroke.enum, ['freestyle', 'backstroke', 'breaststroke', 'butterfly', 'unknown']);
  assert.equal(schema.properties.improvements.items.additionalProperties, false);
  assert.equal(schema.properties.drills.items.additionalProperties, false);
});

test('index.html does not contain duplicate element ids', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], []);
});

test('completed recommendations render in a dedicated result panel', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="analysis-result-section"/);
  assert.match(html, /id="analysis-result-content"/);
  const resultFunction = html.match(/async function loadVideoAnalysisResult[\s\S]*?\n}\n\nfunction resetVideoAnalysisResult/)?.[0] || '';
  assert.match(resultFunction, /analysis-result-content/);
  assert.match(html, /analysis-improvement-card/);
  assert.match(resultFunction, /renderVideoImprovement\(item, frames, index\)/);
  assert.doesNotMatch(html, /analysis-draft|Draft request|updateVideoAnalysisDraft/);
  assert.match(html, /function updateVideoAnalysisFormState/);
  assert.match(html, /sessionStorage\.setItem\('lanelineActiveAnalysisId'/);
  assert.match(html, /await loadVideoAnalysisResult\(id\)/);
  assert.doesNotMatch(html, /id="analysis-(angle|level)"/);
  assert.match(html, /id="analysis-stroke"/);
  assert.match(html, /id="analysis-focus-note"/);
  assert.match(html, /function closestAnalysisFrame/);
  assert.match(html, /function safeAnalysisImageUrl/);
});

test('GitHub Pages redirects to the backend host and non-JSON API responses are handled', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /etop12345\.github\.io/);
  assert.match(html, /https:\/\/laneline\.onrender\.com/);
  assert.match(html, /async function readVideoAnalysisJson/);
});
