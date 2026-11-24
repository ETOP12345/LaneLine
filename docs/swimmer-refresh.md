# LaneLine swimmer refresh

The Western Zone job does not update personal histories. Personal time checks are requested by adding a favorite or pressing that favorite's **Check times** command. Browsing or selecting static swimmers does not contact external time sources. Rankings and relays retain the full shared roster. The separate manual **Daily LaneLine swimmer refresh** workflow requires an explicit comma-separated list of requested favorite member IDs; it no longer walks the whole history file. Best Times and Growth consume the same saved cache. Reloading that shared local cache on startup, login, focus, or every five minutes is not an external USA Swimming check.

## Access requirement

USA Swimming currently denies anonymous API requests with HTTP 403. Signing into the Data Hub in a local browser does not authenticate GitHub Actions. The job supports a repository Actions secret named `USA_SWIMMING_AUTHORIZATION` containing the full Authorization header for an authorized USA Swimming API session. No password or token belongs in source control. Authentication may require additional service-approved access; a header alone has not yet been verified against this account. An expired or rejected session will fail visibly, not report stale times as a successful update.

Run `node scripts/refresh-swimmer-history.js --members ID1,ID2` with the requested favorite member IDs, or provide those IDs to **Run workflow** in GitHub Actions. No IDs means no external checks. Review per-swimmer status before calling the refresh successful. A failed request preserves existing history and the previous successful-check timestamp. Successful results from other requested swimmers are still saved.

When API access is unavailable, each favorite's local request remains visibly pending for the signed-in browser importer. Favoriting does not let an ordinary web page borrow another tab's authentication. The browser automation remains paused until explicitly resumed, and its prompt now limits checks to requested favorites. A verified import newer than the request clears that favorite's pending status after the shared cache reloads.

## Hosting

Set repository **Settings > Pages > Source** to **GitHub Actions** for the new Deploy LaneLine workflow. It deploys after regular pushes and after either refresh job completes, including failed checks so the status reaches the site. This is necessary because commits made with `GITHUB_TOKEN` do not trigger normal push workflows. Public artifacts contain only the static HTML and swim datasets, never the server or environment credentials.

## Signed-In Manual Import

When unattended API access is denied, verified visible Data Hub rows can be imported with `node scripts/import-datahub-history.js`. This starts a temporary localhost-only form on port 5191. The JSON snapshot contains `events` (Data Hub event codes), `meets` (meet names), and `swimmers` (member IDs mapped to arrays of `[eventIndex, time, meetIndex, date]`). Only saved member IDs are accepted. The importer validates every row, merges history without removing older races, and records a manual check separately from unattended success. Stop the importer after use. Do not include login credentials or session tokens in snapshots.

## Tests

Verified team additions are stored in `swimmer-roster.json`, keyed by USA Swimming ID, and loaded before the shared history cache. Existing swimmers are kept even when they age out or move teams. Name-only matching is not used to combine two USA Swimming profiles. The file records discovery coverage rather than claiming a complete club membership roster. Shared history rows are fetched from the dataset rather than duplicated into local storage; locally added history is retained.

Run `npm test`. Tests cover empty/invalid results, failure preservation, cross-course history, deduplication, successful publishing, swimmer matching, and best-time updates from history. A fully unattended refresh is not considered verified until an authenticated job has retrieved current swims and deployed them.
