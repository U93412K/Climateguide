# ClimateGuide

Flood and extreme-rainfall risk prediction plus relief logistics planning. Given a weather scenario and a set of districts, ClimateGuide estimates risk, affected population, food/water/medicine shortages, matches suppliers, routes deliveries around closed roads, and produces a response plan that **a human must approve** before anything is dispatched.

**Stack:** MongoDB, Express, React (Vite), Node 18+. Leaflet/OpenStreetMap for maps, JWT auth with roles, zod validation, helmet and rate limiting, Node's built-in test runner.

## Coverage (sample data)

27 flood-prone districts in 9 states: **Assam** (6), **Bihar** (Supaul, Saharsa, Darbhanga), **Odisha** (Kendrapara, Puri, Balasore), **West Bengal** (Malda, Murshidabad, South 24 Parganas), **Kerala** (Alappuzha, Ernakulam, Idukki), **Uttar Pradesh** (Gorakhpur, Bahraich), **Gujarat** (Surat, Vadodara), **Maharashtra** (Kolhapur, Sangli), **Tamil Nadu** (Chennai, Cuddalore, Nagapattinam), each with nearby supply depots and road links. Data lives in `server/src/data/seed.js` (Assam) and `server/src/data/india.js` (other states). Delete and re-seed to apply changes.

> All bundled data (districts, populations, stock, roads) is **illustrative sample data** for Assam, India. Risk scoring is an uncalibrated, explainable heuristic, not a hydrological model.

## Quick start (no database needed)

```bash
npm run install:all
npm run build           # builds client/dist, served by the API
npm run start:demo      # http://localhost:5000, in-memory data, resets on restart
```

Development with hot reload: `npm run dev:demo` and, in another terminal, `npm run dev:client` (http://localhost:5173, proxies `/api`).

## With MongoDB

```bash
docker compose up -d mongo         # or use any MongoDB 6+ and set MONGODB_URI
cp .env.example server/.env        # edit as needed
npm run dev:server                 # seeds demo data on first start (AUTO_SEED=true)
```
Reseed manually with `npm --prefix server run seed`.

## Demo accounts (development only)

Password `Demo@12345` (override with `SEED_PASSWORD`):

| Role | Email | Can do |
|---|---|---|
| admin | admin@climateguide.example | everything incl. deleting suppliers |
| coordinator | coordinator@climateguide.example | create/approve/reject plans, settings, reports |
| logistics | logistics@climateguide.example | create plans, manage supplier stock, track shipments |
| viewer | viewer@climateguide.example | read plans and roads |

The public (no sign-in) pages are the risk dashboard and incident reporting, for common people.

## Walk-through of the acceptance scenario

1. Open the dashboard: weather and risk per district for the "Heavy rainfall" sample scenario.
2. Sign in as the coordinator, open **Response plans**, click **Generate draft plan**.
3. Review the tabs: risk reasons, affected settlements (Morigaon has one settlement with unknown population, which produces a warning rather than a made-up number), demand vs local stock, supplier allocation, routes. The Nagaon–Jorhat highway is closed in the seed data, so some Majuli deliveries are rerouted.
4. **Approval and delivery**: approval requires ticking the confirmation (and acknowledging critical warnings). Then track shipments; "dispatched" only records status and reserves stock inside ClimateGuide. **It never contacts suppliers.**

## Configuration

See `.env.example`. Optional integrations, all with graceful fallback:
- `OPENWEATHER_API_KEY`: enables live forecast data. If the API fails, the UI offers "Switch to sample data".
- `ANTHROPIC_API_KEY`: the plan briefing text is written by an AI model from the computed figures. Without it a deterministic template is used. The AI never changes numbers.

## How it works

Pipeline stages (`server/src/services/orchestrator.js`): RiskAgent → ExposureAgent → DemandAgent → RoutingAgent → SupplierAgent → CoordinatorAgent. Formulas are documented in `risk.js`, `exposure.js`, `demand.js`. Per-person allocations (food 0.5 kg/day, water 5 L/day, 0.02 medicine kits, 3 planning days) are editable under **Assumptions**; set planning days to 1 for the literal per-person formulas in the spec.

## API (summary)

Public: `GET /api/public/{config,regions,risk,reports,road-segments}`, `POST /api/public/reports`.
Auth: `POST /api/auth/login`, `GET /api/auth/me`.
Staff (Bearer token): `/api/plans` (+ `/:id/approve|reject`, `/:id/shipments/:sid`), `/api/suppliers`, `/api/regions`, `/api/roads`, `/api/reports`, `/api/settings/assumptions`, `/api/audit`, `/api/dashboard/summary`. Errors: `{ "error": { code, message, details } }`.

## Tests

```bash
npm test      # 36 tests: formulas, risk, demand, matching, routing/reroute, dedupe, approval gate, RBAC, API flow
```

## Known limitations

- Risk model is a heuristic; no calibration against historical floods.
- Road network is a small hand-built sample graph (straight-line distance × circuity). OpenStreetMap is used for map tiles only, not routing; import OSM road data for real use.
- Districts, populations, terrain scores, stock and roads are invented sample figures (district names and rough coordinates are real). No census integration.
- Live weather for all 27 districts uses about 54 OpenWeather calls (free plan: 60/minute); pick a state on the dashboard if you hit limits.
- Road disruptions come only from reports and admin updates, not real-time feeds.
- No Python prediction service: the model is implemented in Node.
- Supplier stock is manual. Dispatch is recorded, not executed.
- Map tiles need internet access from the browser.

## Troubleshooting

- *Cannot connect to MongoDB*: start it or run with `DATA_STORE=memory`.
- *Blank page at :5000*: run `npm run build` first.
- *Live weather unavailable*: set `OPENWEATHER_API_KEY` or use sample scenarios.
- *Logins reset on restart*: set `JWT_SECRET`.
