const { execFile } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

loadDotEnvFile(path.join(__dirname, ".env"));

const DEFAULT_CONFIG = Object.freeze({
  maxDailyAnalyses: Number(process.env.MAX_DAILY_ANALYSES || 30),
  maxHourlyAnalyses: Number(process.env.MAX_HOURLY_ANALYSES || 10),
  maxVideoSizeMb: Number(process.env.VIDEO_MAX_SIZE_MB || 50),
  maxVideoDurationSeconds: Number(process.env.VIDEO_MAX_DURATION_SECONDS || 30),
  minVideoHeight: Number(process.env.VIDEO_MIN_HEIGHT || 480),
  frameSampleFps: Number(process.env.FRAME_SAMPLE_FPS || 6),
  maxCandidateFrames: Number(process.env.MAX_CANDIDATE_FRAMES || 180),
  maxAnalysisFrames: Number(process.env.MAX_ANALYSIS_FRAMES || 30),
  frameMaxLongEdge: Number(process.env.FRAME_MAX_LONG_EDGE || 1280),
  frameJpegQuality: Number(process.env.FRAME_JPEG_QUALITY || 78),
  processingTimeoutMs: Number(process.env.PROCESSING_TIMEOUT_MS || 180000),
  openaiModel: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini"
});

const analyses = new Map();
const requestLog = [];
const allowedExtensions = new Set([".mp4", ".mov", ".webm"]);
const allowedMimeTypes = new Set(["video/mp4", "video/quicktime", "video/webm", "application/octet-stream"]);

function createVideoAnalysisRouter(config = DEFAULT_CONFIG) {
  return async function handleVideoAnalysis(req, res, requestUrl) {
    const parts = requestUrl.pathname.split("/").filter(Boolean);
    if (req.method === "GET" && parts.length === 3 && parts[2] === "config") {
      return sendJson(res, 200, publicConfig(config));
    }
    if (req.method === "POST" && parts.length === 2) {
      return handleCreateAnalysis(req, res, config);
    }
    if (req.method === "GET" && parts.length === 3) {
      return handleGetAnalysis(parts[2], res, false);
    }
    if (req.method === "GET" && parts.length === 4 && parts[3] === "result") {
      return handleGetAnalysis(parts[2], res, true);
    }
    return false;
  };
}

async function handleCreateAnalysis(req, res, config) {
  if (!allowRequest(config)) return sendJson(res, 429, { error: "Video analysis limit reached. Please try later." });
  let parsed;
  try {
    parsed = await parseMultipartForm(req, config.maxVideoSizeMb * 1024 * 1024);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }
  const file = parsed.files.video;
  if (!file) return sendJson(res, 400, { error: "Please choose a swimming video." });
  const uploadError = validateUploadedVideo(file, config);
  if (uploadError) return sendJson(res, 400, { error: uploadError });

  const id = crypto.randomUUID();
  const analysis = {
    id,
    status: "queued",
    stage: "Upload complete",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    form: sanitizeAnalysisForm(parsed.fields),
    result: null,
    error: null,
    metadata: null,
    frames: []
  };
  analyses.set(id, analysis);
  sendJson(res, 202, { id, status: analysis.status, stage: analysis.stage });
  processAnalysis(analysis, file, config).catch(error => failAnalysis(analysis, error));
}

async function processAnalysis(analysis, file, config) {
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "laneline-video-"));
  try {
    updateAnalysis(analysis, "validating", "Inspecting video");
    const inputPath = path.join(workDir, safeFileName(file.filename || "upload.mp4"));
    await fsp.writeFile(inputPath, file.data);
    const metadata = await inspectVideo(inputPath, config.processingTimeoutMs);
    validateVideoMetadata(metadata, config);

    updateAnalysis(analysis, "extracting_frames", "Extracting competitive stroke frames");
    const framesDir = path.join(workDir, "frames");
    await fsp.mkdir(framesDir, { recursive: true });
    const candidates = await extractFrames(inputPath, framesDir, metadata, config);
    const selected = selectFrames(candidates, metadata.durationSeconds, config.maxAnalysisFrames);
    if (!selected.length) throw new UserFacingError("No usable frames were extracted from that video.");

    updateAnalysis(analysis, "analyzing", "Analyzing technique");
    const result = await analyzeWithOpenAI({ analysis, metadata, frames: selected, config });
    analysis.metadata = metadata;
    analysis.frames = selected.map(frame => ({ timestampSeconds: frame.timestampSeconds }));
    analysis.result = result;
    updateAnalysis(analysis, "completed", "Recommendations ready");
  } catch (error) {
    failAnalysis(analysis, error);
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true });
  }
}

async function analyzeWithOpenAI({ analysis, metadata, frames, config }) {
  if (!process.env.OPENAI_API_KEY) return demoAnalysis(analysis.form, metadata, frames);
  const prompt = buildAnalysisPrompt(analysis.form, metadata, frames);
  const content = [
    { type: "input_text", text: prompt },
    ...frames.map(frame => ({ type: "input_image", image_url: `data:image/jpeg;base64,${fs.readFileSync(frame.path).toString("base64")}` }))
  ];
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.openaiModel, input: [{ role: "user", content }], text: { format: { type: "json_schema", name: "swim_stroke_analysis", strict: true, schema: analysisSchema() } } })
  });
  if (!response.ok) throw new UserFacingError(`OpenAI request failed with status ${response.status}.`);
  const data = await response.json();
  const text = data.output_text || data.output?.flatMap(item => item.content || []).find(item => item.type === "output_text")?.text;
  if (!text) throw new UserFacingError("OpenAI did not return analysis text.");
  return JSON.parse(text);
}

function buildAnalysisPrompt(form, metadata, frames) {
  return `You are a cautious swimming technique analysis assistant. The images are timestamped still frames from one chronological swim video. Analyze only visible evidence. Do not identify the swimmer or infer sensitive traits. Do not diagnose medical issues. Avoid precise joint angles unless calculated separately. Prioritize no more than three improvements.\n\nContext:\nStroke: ${form.strokeType}\nCamera angle: ${form.cameraAngle}\nSwimmer level: ${form.swimmerLevel}\nGoal: ${form.goal || "none"}\nDuration: ${metadata.durationSeconds.toFixed(2)} seconds\nResolution: ${metadata.width}x${metadata.height}\nFrame timestamps: ${frames.map(frame => frame.timestampSeconds.toFixed(2)).join(", ")} seconds`;
}

async function inspectVideo(inputPath, timeoutMs) {
  const stdout = await execFileText("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", inputPath], timeoutMs);
  const data = JSON.parse(stdout);
  const stream = (data.streams || []).find(row => row.codec_type === "video");
  if (!stream) throw new UserFacingError("That file does not contain a readable video stream.");
  return { durationSeconds: Number(data.format?.duration || stream.duration || 0), width: Number(stream.width || 0), height: Number(stream.height || 0), fps: parseFps(stream.avg_frame_rate || stream.r_frame_rate), codec: stream.codec_name || "unknown" };
}

function validateVideoMetadata(metadata, config) {
  if (!Number.isFinite(metadata.durationSeconds) || metadata.durationSeconds <= 0) throw new UserFacingError("Could not read the video duration.");
  if (metadata.durationSeconds > config.maxVideoDurationSeconds) throw new UserFacingError(`Please upload a clip ${config.maxVideoDurationSeconds} seconds or shorter.`);
  if (Math.min(metadata.width, metadata.height) < config.minVideoHeight) throw new UserFacingError(`Please upload at least ${config.minVideoHeight}p video.`);
}

async function extractFrames(inputPath, framesDir, metadata, config) {
  const fps = Math.min(config.frameSampleFps, Math.max(1, config.maxCandidateFrames / Math.max(metadata.durationSeconds, 1)));
  const outputPattern = path.join(framesDir, "frame_%05d.jpg");
  const scale = `scale='if(gt(iw,ih),min(${config.frameMaxLongEdge},iw),-2)':'if(gt(ih,iw),min(${config.frameMaxLongEdge},ih),-2)'`;
  await execFileText("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", inputPath, "-vf", `fps=${fps},${scale}`, "-q:v", String(jpegQualityToQscale(config.frameJpegQuality)), outputPattern], config.processingTimeoutMs);
  const names = (await fsp.readdir(framesDir)).filter(name => name.endsWith(".jpg")).sort().slice(0, config.maxCandidateFrames);
  return names.map((name, index) => ({ path: path.join(framesDir, name), timestampSeconds: index / fps }));
}

function selectFrames(frames, durationSeconds, maxFrames) {
  if (frames.length <= maxFrames) return frames;
  const selected = [];
  for (let index = 0; index < maxFrames; index += 1) {
    const target = (index + 0.5) * durationSeconds / maxFrames;
    const frame = frames.reduce((best, candidate) => Math.abs(candidate.timestampSeconds - target) < Math.abs(best.timestampSeconds - target) ? candidate : best, frames[0]);
    if (!selected.includes(frame)) selected.push(frame);
  }
  return selected;
}

function parseMultipartForm(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const boundary = (req.headers["content-type"] || "").match(/boundary=(.+)$/)?.[1];
    if (!boundary) return reject(new Error("Upload must use multipart/form-data."));
    const chunks = [];
    let size = 0;
    req.on("data", chunk => { size += chunk.length; if (size > maxBytes + 1024 * 1024) req.destroy(new Error("Uploaded file is too large.")); else chunks.push(chunk); });
    req.on("error", reject);
    req.on("end", () => resolve(parseMultipartBuffer(Buffer.concat(chunks), boundary)));
  });
}

function parseMultipartBuffer(buffer, boundary) {
  const body = buffer.toString("binary");
  const fields = {};
  const files = {};
  for (const part of body.split(`--${boundary}`)) {
    const [rawHeaders, rawValue] = part.split("\r\n\r\n");
    if (!rawHeaders || rawValue === undefined) continue;
    const name = /name="([^"]+)"/.exec(rawHeaders)?.[1];
    if (!name) continue;
    const value = rawValue.replace(/\r\n$/, "");
    const filename = /filename="([^"]*)"/.exec(rawHeaders)?.[1];
    const contentType = /Content-Type:\s*([^\r\n]+)/i.exec(rawHeaders)?.[1] || "application/octet-stream";
    if (filename) files[name] = { filename, contentType, data: Buffer.from(value, "binary") };
    else fields[name] = value;
  }
  return { fields, files };
}

function validateUploadedVideo(file, config) {
  if (file.data.length > config.maxVideoSizeMb * 1024 * 1024) return `Please upload a video ${config.maxVideoSizeMb} MB or smaller.`;
  if (!allowedExtensions.has(path.extname(file.filename || "").toLowerCase())) return "Please upload an MP4, MOV, or WebM video.";
  if (!allowedMimeTypes.has(file.contentType)) return "The uploaded file type is not supported.";
  return "";
}

function demoAnalysis(form, metadata, frames) {
  return { summary: "Demo mode: frame extraction succeeded. Add OPENAI_API_KEY to enable AI stroke analysis.", detected_stroke: form.strokeType, confidence: 0.5, strengths: ["Server-side frame extraction is ready."], improvements: ["Connect an OpenAI API key for technique feedback."], drills: ["Record a clear side-angle clip for the next test."], safety_notice: "AI feedback is educational and is not a substitute for a certified coach, medical professional, or lifeguard.", frame_count: frames.length, duration_seconds: metadata.durationSeconds };
}
function analysisSchema() { return { type: "object", additionalProperties: true, required: ["summary", "detected_stroke", "confidence", "strengths", "improvements", "drills", "safety_notice"], properties: { summary: { type: "string" }, detected_stroke: { type: "string" }, confidence: { type: "number" }, strengths: { type: "array", items: { type: "string" } }, improvements: { type: "array", items: { type: "string" } }, drills: { type: "array", items: { type: "string" } }, safety_notice: { type: "string" } } }; }
function sanitizeAnalysisForm(fields) { return { strokeType: clean(fields.strokeType, "unknown"), cameraAngle: clean(fields.cameraAngle, "mixed"), swimmerLevel: clean(fields.swimmerLevel, "competitive"), goal: String(fields.goal || "").slice(0, 500) }; }
function clean(value, fallback) { return String(value || fallback).replace(/[^a-z_ /-]/gi, "").slice(0, 40) || fallback; }
function publicConfig(config) { return { maxDailyAnalyses: config.maxDailyAnalyses, maxHourlyAnalyses: config.maxHourlyAnalyses, maxVideoSizeMb: config.maxVideoSizeMb, maxVideoDurationSeconds: config.maxVideoDurationSeconds, frameSampleFps: config.frameSampleFps, maxCandidateFrames: config.maxCandidateFrames, maxAnalysisFrames: config.maxAnalysisFrames, openaiEnabled: Boolean(process.env.OPENAI_API_KEY) }; }
function allowRequest(config) { const now = Date.now(); while (requestLog.length && now - requestLog[0] > 86400000) requestLog.shift(); const hourly = requestLog.filter(time => now - time < 3600000).length; if (requestLog.length >= config.maxDailyAnalyses || hourly >= config.maxHourlyAnalyses) return false; requestLog.push(now); return true; }
function updateAnalysis(analysis, status, stage) { analysis.status = status; analysis.stage = stage; analysis.updatedAt = new Date().toISOString(); }
function failAnalysis(analysis, error) { analysis.status = "failed"; analysis.stage = "Failed"; analysis.error = error instanceof UserFacingError ? error.message : "Video analysis failed. Please try a shorter, clearer clip."; analysis.updatedAt = new Date().toISOString(); console.error("video-analysis", analysis.id, error?.message || error); }
function handleGetAnalysis(id, res, includeResult) { const analysis = analyses.get(id); if (!analysis) return sendJson(res, 404, { error: "Analysis not found." }); return sendJson(res, 200, includeResult ? analysis : { id: analysis.id, status: analysis.status, stage: analysis.stage, error: analysis.error }); }
function loadDotEnvFile(envPath) { if (!fs.existsSync(envPath)) return; for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) { const trimmed = line.trim(); if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue; const index = trimmed.indexOf("="); const key = trimmed.slice(0, index).trim(); const value = trimmed.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, "$2"); if (key && process.env[key] === undefined) process.env[key] = value; } }
function safeFileName(name) { return path.basename(name).replace(/[^\w.-]/g, "_") || "upload.mp4"; }
function parseFps(value) { const [a, b] = String(value || "0/1").split("/").map(Number); return b ? a / b : a; }
function jpegQualityToQscale(quality) { return Math.max(2, Math.min(31, Math.round((100 - quality) / 3))); }
function execFileText(command, args, timeout) { return new Promise((resolve, reject) => execFile(command, args, { timeout }, (error, stdout, stderr) => error ? reject(new UserFacingError(`${command} failed. ${String(stderr || error.message).slice(0, 160)}`)) : resolve(stdout))); }
function sendJson(res, status, value) { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0" }); res.end(JSON.stringify(value)); return true; }
class UserFacingError extends Error {}

module.exports = { createVideoAnalysisRouter, selectFrames, validateVideoMetadata, validateUploadedVideo, parseMultipartBuffer, DEFAULT_CONFIG };
