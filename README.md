# Lane Line

Lane Line is a swim time checker for swimmer profiles, best times, PNS cuts, USA Swimming motivational standards, and meet qualification tracking.

## Run

```bash
npm run dev
```

Open `http://localhost:5180`.

No package install is required. The app uses the included Node server for the static page and the USA Swimming best-times refresh endpoint.

## Files

- `index.html` - Lane Line interface and swim standards logic
- `server.js` - local static server and USA Swimming best-times proxy
- `package.json` - run scripts
