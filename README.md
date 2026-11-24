# LaneLine

Swimmer profiles, best times, growth, PNS cuts, rankings, relays, training games, and family technique reviews.

## Run

Use Node.js 22 or newer:

```sh
npm install
npm run dev
```

Open http://localhost:5180. Run `npm run check` for tests.

## Family Video Analysis

For local setup, run `node scripts/configure-family.js` and open the displayed localhost URL. Enter the key and a family access code in that local form, not in chat. It verifies model access without running an analysis, then stores the secrets in the current user's local application-data directory, outside this repository and OneDrive. Restart LaneLine after saving. Hosting services should use their server environment variables instead.

Configure server environment variables using `.env.example` as the template:

```text
OPENAI_API_KEY=your-server-side-key
OPENAI_ANALYSIS_MODEL=gpt-6.1-sol
APP_ACCESS_CODE=your-family-access-code
SESSION_SECRET=your-long-random-session-secret
```

Never commit `.env`, embed an API key in frontend code, or send the key in chat. Without an access code, only loopback clients can use analysis. Remote family access requires `APP_ACCESS_CODE`; sessions use HttpOnly, SameSite cookies. Use HTTPS when hosting.

The browser decodes the selected video and samples up to 24 timestamped JPEG images across a clip of up to 90 seconds and 100 MB. Only those images and the question go to the Node server and OpenAI Responses API. GPT-6.1 Sol accepts images, not native video: https://developers.openai.com/api/docs/models/gpt-6.1-sol . Feedback must acknowledge the limitations of sampled still images.

The raw clip stays in the browser. LaneLine does not save clips, sampled images, or responses to disk. API requests use `store: false`; this is not a promise of zero retention by OpenAI. Responses are displayed as plain text. There is no demo diagnosis or synthetic coaching fallback. No FFmpeg installation is required.

Analysis permits one concurrent request, ten per hour, and thirty per day per server process. Restarting the server resets these in-memory counters. OpenAI usage is billed to the server's API account. Use account-level spending limits as well.

## Favorite Time Checks

Adding a swimmer to Favorites queues one time check. Merely browsing or selecting a swimmer does not contact USA Swimming. Unfavoriting cancels pending work and prevents late results from being applied. Favorites have a retry command and a visible check status. The complete saved roster remains available to rankings and relays.

Authenticated API checks run when the server has authorized USA Swimming access. Otherwise the request waits for a signed-in Data Hub browser import; favoriting does not grant the website access to an unrelated browser's login. The existing browser automation is paused and now scopes its work to explicitly requested favorites, not the static roster. Verified newer imports satisfy pending requests when LaneLine reloads its shared cache.

## Hosting

`render.yaml` defines the Node service and server-side secrets. Deploy the Node app for video analysis; GitHub Pages alone cannot execute the API. The Docker image includes the application assets and does not install FFmpeg. Keep the family access code enabled for any remote deployment. No deployment or Git push is performed by configuring these files.
