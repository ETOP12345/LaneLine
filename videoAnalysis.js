const Busboy = require("busboy");
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
  maxConcurrentAnalyses: Number(process.env.MAX_CONCURRENT_ANALYSES || 1),
  maxVideoSizeMb: Number(process.env.VIDEO_MAX_SIZE_MB || 100),
  maxVideoDurationSeconds: Number(process.env.VIDEO_MAX_DURATION_SECONDS || 60),
  minVideoHeight: Number(process.env.VIDEO_MIN_HEIGHT || 480),
  frameSampleFps: Number(process.env.FRAME_SAMPLE_FPS || 6),
  maxCandidateFrames: Number(process.env.MAX_CANDIDATE_FRAMES || 360),
  maxAnalysisFrames: Number(process.env.MAX_ANALYSIS_FRAMES || 30),
  frameMaxLongEdge: Number(process.env.FRAME_MAX_LONG_EDGE || 1280),
  frameJpegQuality: Number(process.env.FRAME_JPEG_QUALITY || 78),
  processingTimeoutMs: Number(process.env.PROCESSING_TIMEOUT_MS || 180000),
  openaiTimeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 120000),
  openaiModel: process.env.OPENAI_VISION_MODEL || "gpt-5.6-terra",
  openaiReasoningEffort: process.env.OPENAI_REASONING_EFFORT || "medium",
  openaiImageDetail: process.env.OPENAI_IMAGE_DETAIL || "high",
  accessCode: process.env.APP_ACCESS_CODE || "",
  sessionSecret: process.env.SESSION_SECRET || process.env.APP_ACCESS_CODE || "",
  analysisRetentionMs: Number(process.env.ANALYSIS_RETENTION_MS || 3600000)
});

const analyses = new Map();
const requestLog = new Map();
const loginAttempts = new Map();
const allowedExtensions = new Set([".mp4", ".mov", ".webm"]);
const allowedMimeTypes = new Set(["video/mp4", "video/quicktime", "video/webm", "application/octet-stream"]);
let activeAnalysisCount = 0;

function createVideoAnalysisRouter(config = DEFAULT_CONFIG, dependencies = {}) {
  const processAnalysisTask = dependencies.processAnalysis || processAnalysis;
  return async function handleVideoAnalysis(req, res, requestUrl) {
    const parts = requestUrl.pathname.split("/").filter(Boolean);

    if (req.method === "GET" && parts.length === 3 && parts[2] === "config") {
      return sendJson(res, 200, publicConfig(config));
    }
    if (req.method === "POST" && parts.length === 3 && parts[2] === "session") {
      return handleCreateSession(req, res, config);
    }
    if (req.method === "GET" && parts.length === 3 && parts[2] === "session") {
      return sendJson(res, 200, { authorized: isAuthorized(req, config), accessRequired: Boolean(config.accessCode) });
    }
    if (!isAuthorized(req, config)) {
      return sendJson(res, 401, { error: "Enter the LaneLine access code to use video analysis." });
    }
    if (req.method === "POST" && parts.length === 2) {
      return handleCreateAnalysis(req, res, config, processAnalysisTask);
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

async function handleCreateSession(req, res, config) {
  if (!config.accessCode) return sendJson(res, 200, { ok: true, accessRequired: false });
  if (!allowLoginAttempt(req)) return sendJson(res, 429, { error: "Too many access attempts. Try again later." });

  let body;
  try {
    body = await readJsonBody(req, 4096);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }
  if (!secureEqual(String(body.accessCode || ""), config.accessCode)) {
    return sendJson(res, 401, { error: "The access code is not correct." });
  }

  const cookie = [
    `laneline_session=${sessionToken(config)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=604800",
    isSecureRequest(req) ? "Secure" : ""
  ].filter(Boolean).join("; ");
  return sendJson(res, 200, { ok: true, accessRequired: true }, { "Set-Cookie": cookie });
}

async function handleCreateAnalysis(req, res, config, processAnalysisTask) {
  if (activeAnalysisCount >= config.maxConcurrentAnalyses) {
    return sendJson(res, 503, { error: "Another video is being analyzed. Please try again shortly." });
  }

  let uploadDir;
  let parsed;
  try {
    uploadDir = await fsp.mkdtemp(path.join(os.tmpdir(), "laneline-upload-"));
    parsed = await parseMultipartForm(req, config.maxVideoSizeMb * 1024 * 1024, uploadDir);
  } catch (error) {
    if (uploadDir) await fsp.rm(uploadDir, { recursive: true, force: true });
    return sendJson(res, error.statusCode || 400, { error: error.message });
  }

  const file = parsed.files.video;
  if (!file) {
    await fsp.rm(uploadDir, { recursive: true, force: true });
    return sendJson(res, 400, { error: "Please choose a swimming video." });
  }
  const uploadError = validateUploadedVideo(file, config);
  if (uploadError) {
    await fsp.rm(uploadDir, { recursive: true, force: true });
    return sendJson(res, 400, { error: uploadError });
  }
  if (!allowRequest(req, config)) {
    await fsp.rm(uploadDir, { recursive: true, force: true });
    return sendJson(res, 429, { error: "Video analysis limit reached. Please try later." });
  }
  if (activeAnalysisCount >= config.maxConcurrentAnalyses) {
    await fsp.rm(uploadDir, { recursive: true, force: true });
    return sendJson(res, 503, { error: "Another video is being analyzed. Please try again shortly." });
  }

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
  activeAnalysisCount += 1;
  sendJson(res, 202, { id, status: analysis.status, stage: analysis.stage });

  Promise.resolve()
    .then(() => processAnalysisTask(analysis, file, config))
    .catch(error => failAnalysis(analysis, error))
    .finally(() => {
      activeAnalysisCount = Math.max(0, activeAnalysisCount - 1);
      scheduleAnalysisExpiry(id, config.analysisRetentionMs);
    });
  return true;
}

async function processAnalysis(analysis, file, config) {
  const workDir = file.uploadDir || await fsp.mkdtemp(path.join(os.tmpdir(), "laneline-video-"));
  try {
    updateAnalysis(analysis, "validating", "Inspecting video");
    const inputPath = file.path || path.join(workDir, safeFileName(file.filename || "upload.mp4"));
    if (!file.path) await fsp.writeFile(inputPath, file.data);
    const metadata = await inspectVideo(inputPath, config.processingTimeoutMs);
    validateVideoMetadata(metadata, config);

    const focusRegion = focusRegionForNote(analysis.form.focusNote);
    analysis.form.focusRegion = focusRegion?.label || "full frame";
    updateAnalysis(analysis, "extracting_frames", `Finding clear, distinct ${analysis.form.focusRegion} frames at ${config.frameSampleFps} fps`);
    const framesDir = path.join(workDir, "frames");
    await fsp.mkdir(framesDir, { recursive: true });
    const candidates = await extractFrames(inputPath, framesDir, metadata, config, focusRegion);
    const selected = selectFrames(candidates, metadata.durationSeconds, config.maxAnalysisFrames);
    if (!selected.length) throw new UserFacingError("No usable frames were extracted from that video.");

    updateAnalysis(analysis, "analyzing", `Analyzing ${selected.length} selected frames`);
    const result = await analyzeWithOpenAI({ analysis, metadata, frames: selected, config });
    analysis.metadata = metadata;
    analysis.frames = await attachRelevantFrameImages(selected, result);
    analysis.result = result;
    updateAnalysis(analysis, "completed", "Recommendations ready");
  } catch (error) {
    failAnalysis(analysis, error);
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true });
  }
}

async function attachRelevantFrameImages(frames, result) {
  const improvementTimestamps = Array.isArray(result?.improvements)
    ? result.improvements.map(item => Number(item?.timestamp_seconds)).filter(Number.isFinite)
    : [];
  const imageIndexes = new Set(improvementTimestamps.map(timestamp => nearestFrameIndex(frames, timestamp)));
  if (!imageIndexes.size && frames.length) imageIndexes.add(Math.floor(frames.length / 2));
  return Promise.all(frames.map(async (frame, index) => ({
    timestampSeconds: frame.timestampSeconds,
    ...(imageIndexes.has(index) ? { imageUrl: `data:image/jpeg;base64,${(await fsp.readFile(frame.path)).toString("base64")}` } : {})
  })));
}

function nearestFrameIndex(frames, timestampSeconds) {
  if (!frames.length) return -1;
  let nearestIndex = 0;
  for (let index = 1; index < frames.length; index += 1) {
    if (Math.abs(frames[index].timestampSeconds - timestampSeconds) < Math.abs(frames[nearestIndex].timestampSeconds - timestampSeconds)) nearestIndex = index;
  }
  return nearestIndex;
}

async function analyzeWithOpenAI({ analysis, metadata, frames, config }) {
  if (!process.env.OPENAI_API_KEY) return demoAnalysis(analysis.form, metadata, frames, config.openaiModel);
  const prompt = buildAnalysisPrompt(analysis.form, metadata, frames);
  const encodedFrames = await Promise.all(frames.map(async frame => ({
    timestampSeconds: frame.timestampSeconds,
    imageUrl: `data:image/jpeg;base64,${(await fsp.readFile(frame.path)).toString("base64")}`
  })));
  const content = [{ type: "input_text", text: prompt }];
  encodedFrames.forEach((frame, index) => {
    content.push({ type: "input_text", text: `Frame ${index + 1} at ${frame.timestampSeconds.toFixed(2)} seconds` });
    content.push({ type: "input_image", detail: config.openaiImageDetail, image_url: frame.imageUrl });
  });

  const requestBody = {
    model: config.openaiModel,
    input: [{ role: "user", content }],
    max_output_tokens: 2200,
    text: {
      format: {
        type: "json_schema",
        name: "swim_stroke_analysis",
        strict: true,
        schema: analysisSchema()
      }
    }
  };
  if (config.openaiReasoningEffort) requestBody.reasoning = { effort: config.openaiReasoningEffort };

  const response = await fetchOpenAIWithRetry(requestBody, config.openaiTimeoutMs);
  const data = await response.json();
  const outputText = data.output_text || data.output
    ?.flatMap(item => item.content || [])
    .find(item => item.type === "output_text")?.text;
  if (!outputText) throw new UserFacingError("OpenAI did not return analysis text.");
  try {
    return JSON.parse(outputText);
  } catch {
    throw new UserFacingError("OpenAI returned analysis in an unexpected format.");
  }
}

async function fetchOpenAIWithRetry(requestBody, timeoutMs) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      if (response.ok) return response;
      const requestId = response.headers.get("x-request-id");
      if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
        await delay(750);
        continue;
      }
      throw new UserFacingError(`OpenAI request failed with status ${response.status}${requestId ? ` (${requestId})` : ""}.`);
    } catch (error) {
      if (error instanceof UserFacingError) throw error;
      if (attempt === 0 && error.name !== "AbortError") {
        await delay(750);
        continue;
      }
      throw new UserFacingError(error.name === "AbortError" ? "OpenAI analysis timed out." : "Could not reach OpenAI for analysis.");
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new UserFacingError("Could not reach OpenAI for analysis.");
}

function buildAnalysisPrompt(form, metadata, frames) {
  return `You are a cautious swimming technique analysis assistant. The following ${frames.length} chronological images were selected from one swim video for sharpness, visual distinctness, and coverage across the clip. Analyze only visible evidence and use the timestamps to describe when each observation occurs.

The uploader has selected ${form.strokeType} as the stroke to analyze. Treat that selection as authoritative: do not reclassify the stroke, and set detected_stroke to "${form.strokeType}". Evaluate the visible technique using the mechanics and timing expected for ${form.strokeType}. If part of the technique is obscured, state the limitation instead of changing the selected stroke.

Detect the camera view from the images. Use the uploader note only to choose which visible swimmer to follow. If the requested swimmer cannot be distinguished consistently, state that limitation. Do not identify the swimmer, infer identity or sensitive traits, assign a skill level, or diagnose medical issues. Avoid precise joint angles unless measured. Return no more than three priority improvements. For every improvement, cite the most relevant visible timestamp, explain the performance impact, and provide one short actionable cue. Recommend concise drills that directly address those improvements. If the footage does not support a conclusion, say so instead of guessing.

Context:
Uploader-selected stroke: ${form.strokeType}
Uploader focus note: ${form.focusNote || "none; analyze the most prominent swimmer"}
Applied image focus: ${form.focusRegion || "full frame"}
Duration: ${metadata.durationSeconds.toFixed(2)} seconds
Resolution: ${metadata.width}x${metadata.height}
Frame timestamps: ${frames.map(frame => frame.timestampSeconds.toFixed(2)).join(", ")} seconds`;
}

async function inspectVideo(inputPath, timeoutMs) {
  const stdout = await execFileText("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", inputPath], timeoutMs);
  const data = JSON.parse(stdout);
  const stream = (data.streams || []).find(row => row.codec_type === "video");
  if (!stream) throw new UserFacingError("That file does not contain a readable video stream.");
  return {
    durationSeconds: Number(data.format?.duration || stream.duration || 0),
    width: Number(stream.width || 0),
    height: Number(stream.height || 0),
    fps: parseFps(stream.avg_frame_rate || stream.r_frame_rate),
    codec: stream.codec_name || "unknown"
  };
}

function validateVideoMetadata(metadata, config) {
  if (!Number.isFinite(metadata.durationSeconds) || metadata.durationSeconds <= 0) throw new UserFacingError("Could not read the video duration.");
  if (metadata.durationSeconds > config.maxVideoDurationSeconds) throw new UserFacingError(`Please upload a clip ${config.maxVideoDurationSeconds} seconds or shorter.`);
  if (Math.min(metadata.width, metadata.height) < config.minVideoHeight) throw new UserFacingError(`Please upload at least ${config.minVideoHeight}p video.`);
}

async function extractFrames(inputPath, framesDir, metadata, config, focusRegion = null) {
  const fps = Math.min(config.frameSampleFps, Math.max(1, config.maxCandidateFrames / Math.max(metadata.durationSeconds, 1)));
  const outputPattern = path.join(framesDir, "frame_%05d.jpg");
  const probePattern = path.join(framesDir, "probe_%05d.pgm");
  const scale = `scale='if(gt(iw,ih),min(${config.frameMaxLongEdge},iw),-2)':'if(gt(ih,iw),min(${config.frameMaxLongEdge},ih),-2)'`;
  const sharedFilters = [`fps=${fps}`];
  if (focusRegion) sharedFilters.push(focusRegion.filter);
  const filterGraph = `[0:v]${sharedFilters.join(",")},split=2[analysis][quality];[analysis]${scale}[analysis_out];[quality]scale=96:-2,format=gray[quality_out]`;
  await execFileText("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", inputPath,
    "-filter_complex", filterGraph,
    "-map", "[analysis_out]", "-q:v", String(jpegQualityToQscale(config.frameJpegQuality)), outputPattern,
    "-map", "[quality_out]", probePattern
  ], config.processingTimeoutMs);
  const names = (await fsp.readdir(framesDir)).filter(name => name.endsWith(".jpg")).sort().slice(0, config.maxCandidateFrames);
  return Promise.all(names.map(async (name, index) => {
    const probePath = path.join(framesDir, name.replace("frame_", "probe_").replace(/\.jpg$/i, ".pgm"));
    const thumbnail = parsePortableGraymap(await fsp.readFile(probePath));
    const metrics = grayscaleMetrics(thumbnail.pixels, thumbnail.width, thumbnail.height);
    return {
      path: path.join(framesDir, name),
      timestampSeconds: index / fps,
      thumbnail: thumbnail.pixels,
      sharpness: metrics.sharpness,
      contrast: metrics.contrast
    };
  }));
}

function selectFrames(frames, _durationSeconds, maxFrames) {
  if (!frames.length || maxFrames <= 0) return [];
  const targetCount = Math.min(
    maxFrames,
    frames.length <= maxFrames ? Math.max(Math.min(6, frames.length), Math.ceil(frames.length / 2)) : maxFrames
  );
  const selected = [];
  for (let bucketIndex = 0; bucketIndex < targetCount; bucketIndex += 1) {
    const start = Math.floor(bucketIndex * frames.length / targetCount);
    const end = Math.max(start + 1, Math.floor((bucketIndex + 1) * frames.length / targetCount));
    const candidates = frames.slice(start, end);
    const ranked = candidates
      .map(frame => ({ frame, quality: frameQuality(frame), distinctness: minimumFrameDistance(frame, selected) }))
      .sort((left, right) => {
        const leftScore = left.quality + left.distinctness * 8;
        const rightScore = right.quality + right.distinctness * 8;
        return rightScore - leftScore;
      });
    const distinctCandidate = ranked.find(candidate => candidate.distinctness >= 0.025);
    selected.push((distinctCandidate || ranked[0]).frame);
  }
  return selected.sort((left, right) => left.timestampSeconds - right.timestampSeconds);
}

function parsePortableGraymap(buffer) {
  let offset = 0;
  const tokens = [];
  while (tokens.length < 4 && offset < buffer.length) {
    while (offset < buffer.length && /\s/.test(String.fromCharCode(buffer[offset]))) offset += 1;
    if (buffer[offset] === 35) {
      while (offset < buffer.length && buffer[offset] !== 10) offset += 1;
      continue;
    }
    const start = offset;
    while (offset < buffer.length && !/\s/.test(String.fromCharCode(buffer[offset]))) offset += 1;
    tokens.push(buffer.toString("ascii", start, offset));
  }
  if (buffer[offset] === 13 && buffer[offset + 1] === 10) offset += 2;
  else if (offset < buffer.length && /\s/.test(String.fromCharCode(buffer[offset]))) offset += 1;
  const [magic, widthText, heightText, maxValueText] = tokens;
  const width = Number(widthText);
  const height = Number(heightText);
  const maxValue = Number(maxValueText);
  if (magic !== "P5" || !width || !height || maxValue !== 255 || buffer.length - offset < width * height) {
    throw new UserFacingError("Could not score the extracted video frames.");
  }
  return { width, height, pixels: new Uint8Array(buffer.subarray(offset, offset + width * height)) };
}

function grayscaleMetrics(pixels, width, height) {
  let sum = 0;
  let sumSquared = 0;
  let laplacianSum = 0;
  let laplacianSquared = 0;
  let laplacianCount = 0;
  for (const value of pixels) {
    sum += value;
    sumSquared += value * value;
  }
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const laplacian = 4 * pixels[index] - pixels[index - 1] - pixels[index + 1] - pixels[index - width] - pixels[index + width];
      laplacianSum += laplacian;
      laplacianSquared += laplacian * laplacian;
      laplacianCount += 1;
    }
  }
  const mean = sum / pixels.length;
  const laplacianMean = laplacianSum / Math.max(1, laplacianCount);
  return {
    contrast: Math.max(0, sumSquared / pixels.length - mean * mean),
    sharpness: Math.max(0, laplacianSquared / Math.max(1, laplacianCount) - laplacianMean * laplacianMean)
  };
}

function frameQuality(frame) {
  return Math.log1p(Number(frame.sharpness || 0)) + Math.log1p(Number(frame.contrast || 0)) * 0.15;
}

function minimumFrameDistance(frame, selected) {
  if (!frame.thumbnail || !selected.length) return selected.length ? 0 : 1;
  let minimum = 1;
  for (const other of selected) {
    if (!other.thumbnail || other.thumbnail.length !== frame.thumbnail.length) continue;
    let absoluteDifference = 0;
    for (let index = 0; index < frame.thumbnail.length; index += 1) {
      absoluteDifference += Math.abs(frame.thumbnail[index] - other.thumbnail[index]);
    }
    minimum = Math.min(minimum, absoluteDifference / (frame.thumbnail.length * 255));
  }
  return minimum;
}

function parseMultipartForm(req, maxBytes, uploadDir) {
  return new Promise((resolve, reject) => {
    let parser;
    try {
      parser = Busboy({
        headers: req.headers,
        limits: { fileSize: maxBytes, files: 1, fields: 8, parts: 10, fieldSize: 2048 }
      });
    } catch {
      reject(new UserFacingError("Upload must use multipart/form-data."));
      return;
    }

    const fields = {};
    const files = {};
    const writePromises = [];
    let fileTooLarge = false;
    let settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      reject(error instanceof UserFacingError ? error : new UserFacingError("Could not read the uploaded video."));
    };

    parser.on("field", (name, value, info) => {
      if (!info.valueTruncated) fields[name] = value;
    });
    parser.on("file", (name, stream, info) => {
      if (name !== "video" || files.video) {
        stream.resume();
        return;
      }
      const filename = safeFileName(info.filename || "upload.mp4");
      const filePath = path.join(uploadDir, `${crypto.randomUUID()}-${filename}`);
      const file = {
        filename,
        contentType: info.mimeType || "application/octet-stream",
        path: filePath,
        uploadDir,
        size: 0
      };
      files.video = file;
      const output = fs.createWriteStream(filePath, { flags: "wx" });
      stream.on("data", chunk => { file.size += chunk.length; });
      stream.on("limit", () => { fileTooLarge = true; });
      writePromises.push(new Promise((resolveWrite, rejectWrite) => {
        output.on("finish", resolveWrite);
        output.on("error", rejectWrite);
        stream.on("error", rejectWrite);
      }));
      stream.pipe(output);
    });
    parser.on("filesLimit", () => fail(new UserFacingError("Upload one video at a time.")));
    parser.on("fieldsLimit", () => fail(new UserFacingError("Too many upload fields.")));
    parser.on("partsLimit", () => fail(new UserFacingError("Upload contains too many parts.")));
    parser.on("error", fail);
    parser.on("close", async () => {
      if (settled) return;
      try {
        await Promise.all(writePromises);
        if (fileTooLarge) throw new UserFacingError(`Please upload a video ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`);
        settled = true;
        resolve({ fields, files });
      } catch (error) {
        fail(error);
      }
    });
    req.on("aborted", () => fail(new UserFacingError("Video upload was interrupted.")));
    req.on("error", fail);
    req.pipe(parser);
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
    if (filename) files[name] = { filename, contentType, data: Buffer.from(value, "binary"), size: Buffer.byteLength(value, "binary") };
    else fields[name] = value;
  }
  return { fields, files };
}

function validateUploadedVideo(file, config) {
  const size = Number(file.size ?? file.data?.length ?? 0);
  if (!size) return "The selected video is empty.";
  if (size > config.maxVideoSizeMb * 1024 * 1024) return `Please upload a video ${config.maxVideoSizeMb} MB or smaller.`;
  if (!allowedExtensions.has(path.extname(file.filename || "").toLowerCase())) return "Please upload an MP4, MOV, or WebM video.";
  if (!allowedMimeTypes.has(file.contentType)) return "The uploaded file type is not supported.";
  return "";
}

function analysisSchema() {
  const strictStringArray = { type: "array", maxItems: 3, items: { type: "string" } };
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "detected_stroke", "detected_camera_angle", "confidence", "strengths", "improvements", "drills", "safety_notice"],
    properties: {
      summary: { type: "string" },
      detected_stroke: { type: "string", enum: ["freestyle", "backstroke", "breaststroke", "butterfly", "unknown"] },
      detected_camera_angle: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      strengths: strictStringArray,
      improvements: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["timestamp_seconds", "observation", "impact", "cue"],
          properties: {
            timestamp_seconds: { type: "number", minimum: 0 },
            observation: { type: "string" },
            impact: { type: "string" },
            cue: { type: "string" }
          }
        }
      },
      drills: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "instructions", "purpose"],
          properties: {
            name: { type: "string" },
            instructions: { type: "string" },
            purpose: { type: "string" }
          }
        }
      },
      safety_notice: { type: "string" }
    }
  };
}

function demoAnalysis(form, metadata, frames, model) {
  return {
    summary: `Demo mode: ${frames.length} frames were extracted successfully. Add OPENAI_API_KEY to enable ${model} analysis.`,
    detected_stroke: form.strokeType,
    detected_camera_angle: "unknown",
    confidence: 0.5,
    strengths: ["Server-side frame extraction is ready."],
    improvements: [{ timestamp_seconds: frames[0]?.timestampSeconds || 0, observation: "AI analysis is not enabled.", impact: "Technique feedback requires an OpenAI API key.", cue: "Configure the production secret and retry." }],
    drills: [{ name: "Clear side-angle recording", instructions: "Record a short, well-lit clip with the full swimmer visible.", purpose: "Provide stronger visual evidence for the next analysis." }],
    safety_notice: "AI feedback is educational and is not a substitute for a certified coach, medical professional, or lifeguard.",
    frame_count: frames.length,
    duration_seconds: metadata.durationSeconds
  };
}

function sanitizeAnalysisForm(fields) {
  const allowedStrokes = new Set(["freestyle", "backstroke", "breaststroke", "butterfly"]);
  const strokeType = String(fields.strokeType || "freestyle").toLowerCase();
  return {
    strokeType: allowedStrokes.has(strokeType) ? strokeType : "freestyle",
    focusNote: String(fields.focusNote || fields.goal || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 300)
  };
}

function focusRegionForNote(note) {
  const normalized = String(note || "").toLowerCase();
  if (/\b(bottom|lower|lowest|nearest|closest)\b/.test(normalized)) {
    return { label: "bottom-lane focus", filter: "crop=iw:ih*0.58:0:ih*0.42" };
  }
  if (/\b(top|upper|highest|farthest|furthest)\b/.test(normalized)) {
    return { label: "top-lane focus", filter: "crop=iw:ih*0.58:0:0" };
  }
  if (/\b(middle|center|centre)\b/.test(normalized)) {
    return { label: "middle-lane focus", filter: "crop=iw:ih*0.60:0:ih*0.20" };
  }
  return null;
}

function publicConfig(config) {
  return {
    maxDailyAnalyses: config.maxDailyAnalyses,
    maxHourlyAnalyses: config.maxHourlyAnalyses,
    maxConcurrentAnalyses: config.maxConcurrentAnalyses,
    maxVideoSizeMb: config.maxVideoSizeMb,
    maxVideoDurationSeconds: config.maxVideoDurationSeconds,
    frameSampleFps: config.frameSampleFps,
    maxCandidateFrames: config.maxCandidateFrames,
    maxAnalysisFrames: config.maxAnalysisFrames,
    model: config.openaiModel,
    openaiEnabled: Boolean(process.env.OPENAI_API_KEY),
    accessRequired: Boolean(config.accessCode)
  };
}

function allowRequest(req, config) {
  const now = Date.now();
  const key = clientKey(req);
  const rows = (requestLog.get(key) || []).filter(time => now - time < 86400000);
  const hourly = rows.filter(time => now - time < 3600000).length;
  if (rows.length >= config.maxDailyAnalyses || hourly >= config.maxHourlyAnalyses) return false;
  rows.push(now);
  requestLog.set(key, rows);
  return true;
}

function allowLoginAttempt(req) {
  const now = Date.now();
  const key = clientKey(req);
  const rows = (loginAttempts.get(key) || []).filter(time => now - time < 900000);
  if (rows.length >= 10) return false;
  rows.push(now);
  loginAttempts.set(key, rows);
  return true;
}

function isAuthorized(req, config) {
  if (!config.accessCode) return true;
  const token = parseCookies(req.headers.cookie || "").laneline_session || "";
  return secureEqual(token, sessionToken(config));
}

function sessionToken(config) {
  return crypto.createHmac("sha256", config.sessionSecret).update("laneline-video-access-v1").digest("base64url");
}

function parseCookies(value) {
  return Object.fromEntries(String(value).split(";").map(part => part.trim()).filter(Boolean).map(part => {
    const index = part.indexOf("=");
    return index < 0 ? [part, ""] : [part.slice(0, index), part.slice(index + 1)];
  }));
}

function secureEqual(left, right) {
  const leftHash = crypto.createHash("sha256").update(String(left)).digest();
  const rightHash = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function clientKey(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

function isSecureRequest(req) {
  return process.env.NODE_ENV === "production" || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new UserFacingError("Request body is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new UserFacingError("Request body must be valid JSON."));
      }
    });
  });
}

function scheduleAnalysisExpiry(id, retentionMs) {
  const timer = setTimeout(() => analyses.delete(id), retentionMs);
  timer.unref?.();
}

function updateAnalysis(analysis, status, stage) {
  analysis.status = status;
  analysis.stage = stage;
  analysis.updatedAt = new Date().toISOString();
}

function failAnalysis(analysis, error) {
  analysis.status = "failed";
  analysis.stage = "Failed";
  analysis.error = error instanceof UserFacingError ? error.message : "Video analysis failed. Please try a shorter, clearer clip.";
  analysis.updatedAt = new Date().toISOString();
  console.error("video-analysis", analysis.id, error?.message || error);
}

function handleGetAnalysis(id, res, includeResult) {
  const analysis = analyses.get(id);
  if (!analysis) return sendJson(res, 404, { error: "Analysis not found or expired." });
  return sendJson(res, 200, includeResult ? analysis : { id: analysis.id, status: analysis.status, stage: analysis.stage, error: analysis.error });
}

function loadDotEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function safeFileName(name) { return path.basename(name).replace(/[^\w.-]/g, "_") || "upload.mp4"; }
function parseFps(value) { const [a, b] = String(value || "0/1").split("/").map(Number); return b ? a / b : a; }
function jpegQualityToQscale(quality) { return Math.max(2, Math.min(31, Math.round((100 - quality) / 3))); }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function execFileText(command, args, timeout) {
  return new Promise((resolve, reject) => execFile(command, args, { timeout }, (error, stdout, stderr) => {
    if (!error) return resolve(stdout);
    const detail = error.code === "ENOENT" ? `${command} is not installed on the server.` : `${command} failed. ${String(stderr || error.message).slice(0, 160)}`;
    reject(new UserFacingError(detail));
  }));
}

function sendJson(res, status, value, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    ...headers
  });
  res.end(JSON.stringify(value));
  return true;
}

class UserFacingError extends Error {}

module.exports = {
  analysisSchema,
  createVideoAnalysisRouter,
  focusRegionForNote,
  parseMultipartBuffer,
  selectFrames,
  validateVideoMetadata,
  validateUploadedVideo,
  DEFAULT_CONFIG
};
