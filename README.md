# Lane Line

Lane Line is a swim time checker for swimmer profiles, best times, PNS cuts, USA Swimming motivational standards, meet qualification tracking, and swimming-video stroke analysis.

## Run

```bash
npm run dev
```

Open `http://localhost:5180`.

No package install is required. The app uses the included Node server for the static page, USA Swimming best-times refresh endpoints, Swimcloud best-times proxy, and the video-analysis API.

## Video analysis

The **Video analysis** tab uploads a short MP4, MOV, or WebM swimming clip to the local Node server. The server:

- validates file type and size before processing
- inspects real video metadata with `ffprobe`
- rejects clips that are too long or below the minimum resolution
- extracts dense candidate frames with `ffmpeg` at 6 frames per second by default
- selects up to 30 representative timestamped frames
- sends selected frames to the OpenAI Responses API when `OPENAI_API_KEY` is configured
- returns a demo result when no OpenAI key is configured so the UI flow can be exercised without API spend
- deletes temporary local files after processing

Default free-tier-friendly limits are 30 analyses per day, 10 per hour, 30 seconds per clip, and 50 MB per upload.

## Environment

Copy `.env.example` to `.env` for local secrets and tunable limits:

```bash
cp .env.example .env
```

At minimum, real AI analysis requires these server-side values:

```text
OPENAI_API_KEY=
OPENAI_VISION_MODEL=gpt-4.1-mini
```

Never put the OpenAI API key in browser JavaScript.

## FFmpeg requirement

Install FFmpeg locally or on the hosting service so both commands are available on `PATH`:

```bash
ffmpeg -version
ffprobe -version
```

## Files

- `index.html` - Lane Line interface, swim standards logic, and video-analysis UI
- `server.js` - local static server, swim-times proxies, and video-analysis route mounting
- `videoAnalysis.js` - upload validation, rate limiting, FFprobe/FFmpeg processing, frame selection, and OpenAI integration
- `test/videoAnalysis.test.js` - Node tests for validation and frame selection
- `package.json` - run, test, and check scripts
- `.env.example` - server-side configuration template
