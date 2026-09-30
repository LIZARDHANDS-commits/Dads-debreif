# The traffic relay

A very small server program that lets the SOF's map show live aircraft.

## Why it exists

The SOF screen runs in a browser. The free aircraft feeds (adsb.lol and the others) don't let a web page read them directly, so the page asks this relay instead, and the relay asks adsb.lol. It is the "own relay" from SPEC-sof (SOF-7).

## What it does

It answers one kind of request:

```
GET /traffic?lat=50.33&lon=-105.56&nm=100
```

- `lat` is -90 to 90, `lon` is -180 to 180, `nm` is 5 to 150 (100 if left out). Anything else, and any other setting in the address, is refused with a plain error before anything is fetched.
- It asks adsb.lol for the aircraft within that many nautical miles and sends back only what the map draws: id, callsign, registration, type, position, altitude, ground speed, track, squawk, seconds since seen, and a military flag.
- It keeps each answer for 5 seconds, so any number of open screens cost adsb.lol at most one request per 5 seconds per place.
- It sends at most 1,000 aircraft (the nearest ones) and never more than 1 MB.
- It treats what adsb.lol sends as untrusted. Each field is checked and rebuilt, so odd text (a script in a callsign, say) is dropped, and a reply that is too big or the wrong shape becomes a short error, never passed through.
- It only lets the live site (`https://lizardhands-commits.github.io`) and local development (`http://localhost:5173`, `http://127.0.0.1:5173`) read it from a browser. Other sites' browsers are refused.
- It has no keys, stores nothing, and logs nothing about who asked.

The code is [`traffic.js`](traffic.js); its tests are `tests/unit/relay/traffic.test.js` (run with `npm test`, no network needed).

## Setting it up (high level)

It runs on a free Cloudflare account (the Workers free plan allows 100,000 requests a day; one screen open all day is about 8,600).

1. Make a free account at cloudflare.com if there isn't one.
2. In the dashboard, open Workers & Pages and create a new Worker.
3. Put the contents of `traffic.js` in it and deploy. (Or, if you use Cloudflare's `wrangler` command line tool, deploy this file as the Worker's main module.)
4. Copy the Worker's address (it ends in `workers.dev`). That address goes into the SOF's build setting, and into the page's Content Security Policy (through the app frame, see SPEC-sof).
5. Optional: to allow a different site, set a variable named `ALLOWED_ORIGINS` on the Worker to a comma-separated list of exact origins. If it is left out, or holds nothing usable, the defaults above apply. It can never be set to "allow all".

**Keys and secrets:** the relay needs none today. If adsb.lol ever asks for a key, it goes in a Worker environment variable or secret in the Cloudflare dashboard, never in this file or anywhere in the repository.

To limit abuse further, Cloudflare's dashboard can add a rate-limiting rule on the Worker's address. That is an account setting, not code.

## Credit and terms for adsb.lol

Read on 2026-09-30 from adsb.lol's API page (`https://api.adsb.lol/docs`, its OpenAPI text) and `https://www.adsb.lol/docs/open-data/api/`:

- Using the API is free. It says an API key (given for feeding data to adsb.lol) may be needed in the future, and that anyone using it for production should contact adsb.lol first so nothing breaks by accident. Before the SOF goes into real daily use, get in touch with them and tell them about the relay.
- The data and the API are licensed under the Open Data Commons Open Database License (ODbL) 1.0, the same licence OpenStreetMap uses. That means the data may be used and shared, but it **must be credited**, and a database made from it stays under the same licence.
- So the SOF's credits line names it wherever traffic is shown, for example: "Aircraft: adsb.lol (ODbL 1.0)", linking to https://www.adsb.lol/. The relay's reply also carries `"source": "adsb.lol"`.
- The relay keeps nothing (only a 5 second cache), so it doesn't build a database of its own.

Terms can change. Read adsb.lol's page again when the relay is deployed and whenever it stops working.
