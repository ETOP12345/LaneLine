# LaneLine swimmer refresh

The Western Zone job does not update personal histories. The separate **Daily LaneLine swimmer refresh** job reads every member ID in `datahub-history.json`, fetches all courses, merges every swim into that file, and records per-swimmer results in `datahub-refresh-status.json`. Best Times and Growth consume the same cache. The site reloads that cache on startup, account login, window focus, and every five minutes.

## Access requirement

USA Swimming currently denies anonymous API requests with HTTP 403. Signing into the Data Hub in a local browser does not authenticate GitHub Actions. The job supports a repository Actions secret named `USA_SWIMMING_AUTHORIZATION` containing the full Authorization header for an authorized USA Swimming API session. No password or token belongs in source control. Authentication may require additional service-approved access; a header alone has not yet been verified against this account. An expired or rejected session will fail visibly, not report stale times as a successful update.

Run `node scripts/refresh-swimmer-history.js` locally, or select **Run workflow** in GitHub Actions. Review the per-swimmer status before calling the refresh successful. A failed request preserves existing history and the previous successful-check timestamp. Successful results from other swimmers are still saved.

## Hosting

Set repository **Settings > Pages > Source** to **GitHub Actions** for the new Deploy LaneLine workflow. It deploys after regular pushes and after either refresh job completes, including failed checks so the status reaches the site. This is necessary because commits made with `GITHUB_TOKEN` do not trigger normal push workflows. Public artifacts contain only the static HTML and swim datasets, never the server or environment credentials.

## Signed-In Manual Import

When unattended API access is denied, verified visible Data Hub rows can be imported with `node scripts/import-datahub-history.js`. This starts a temporary localhost-only form on port 5191. The JSON snapshot contains `events` (Data Hub event codes), `meets` (meet names), and `swimmers` (member IDs mapped to arrays of `[eventIndex, time, meetIndex, date]`). Only saved member IDs are accepted. The importer validates every row, merges history without removing older races, and records a manual check separately from unattended success. Stop the importer after use. Do not include login credentials or session tokens in snapshots.

## Tests

Run `npm test`. Tests cover empty/invalid results, failure preservation, cross-course history, deduplication, successful publishing, swimmer matching, and best-time updates from history. A fully unattended refresh is not considered verified until an authenticated job has retrieved current swims and deployed them.
