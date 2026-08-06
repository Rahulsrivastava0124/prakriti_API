# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

`prakriti.one` API server — a Node/Express backend for a jewellery business platform (distributors, retailers, suppliers, sales executives, managers, employees, customers, super-admin). MySQL via Sequelize is the primary datastore (Mongoose is a listed dependency but the active models/migrations are Sequelize).

## Commands

```bash
npm install                # install deps (postinstall also force-installs puppeteer)
npm run dev                 # nodemon server.js — local development
npm start                   # node server.js — production
```

There is no lint script, no test runner, and no build step configured in `package.json`. Don't invent `npm test`/`npm run lint` invocations — they don't exist.

Sequelize CLI is a dependency but there's no `.sequelizerc`; migrations/seeders are run against `config/config.js` directly, e.g.:
```bash
npx sequelize-cli db:migrate --env development
npx sequelize-cli db:seed:all --env development
```
Environment selection is via `NODE_ENV` (`development` | `test` | `production`), read in [config/config.js](config/config.js). Each env's DB host/port/credentials come from `.env` (`DB_DEV_*`, `DB_TEST_*`, `DB_PROD_*`) with hardcoded fallbacks in that file.

API docs are auto-generated from JSDoc route annotations via `swagger-jsdoc`, served at `/api-docs` (see `swaggeroptions.apis` in [server.js](server.js) — it only scans `./app/routes/app/*.routes.js`, a path that doesn't match the actual route files at `app/routes/*.routes.js`).

## Branching model

Three long-lived branches: `dev` → `test` → `prod`. `prod` is the default/production branch. Feature work happens on `dev`, promoted through `test` before reaching `prod`. See [README.md](README.md) for the full GitHub-issue-driven contribution flow (fork-free, issue → branch → PR against `dev`).

## Architecture

### Role-based module structure

The app is organized by **role**, not by resource. Each role (`admin`, `superadmin`, `distributor`, `sales_executive`, `retailer`, `customer`, `supplier`, `manager`, `employee`, `team`) has its own:
- Route file: `app/routes/<role>.routes.js`, mounted independently in [server.js](server.js) (each exports `(app, express) => {...}` and defines its own `express.Router()`).
- Controller directory: `app/controllers/<role>/*.controller.js`
- Validator directory: `app/utils/validators/<role>/*.js` (used as Express middleware before the controller)
- Resource/collection directory: `app/resources/<role>/*Collection.js` (response shaping — takes a Sequelize instance or array and returns a plain object/array for the API response)

Roles share underlying Sequelize models and often the same controller logic is reused across role namespaces (e.g. `app/routes/admin.routes.js` pulls `adminController` from `@controllers/superadmin/admin.controller` and `walletController` from `@controllers/superadmin/wallet.controller`) — don't assume a route's controller lives under the matching role folder; check the actual `require` at the top of the routes file.

### Path aliases

`module-alias` (registered first thing in [server.js](server.js)) maps these, defined in [package.json](package.json) `_moduleAliases`:
```
@controllers → app/controllers
@helpers     → app/helpers
@library     → app/library
@middlewares → app/middlewares
@models      → models
@resources   → app/resources
@routes      → app/routes
@utils       → app/utils
@config      → config
```
Use these aliases in new code rather than relative `../../` paths — the rest of the codebase does.

### Auth

JWT-based. [app/middlewares/authJwt.js](app/middlewares/authJwt.js) exports `verifyToken`/`verifyTokenForGuest` (decode + attach `req.userId`/`req.role`) and per-role gate functions (`isAdmin`, `isDistributor`, `isSuperAdmin`, etc.). Routes chain these as middleware arrays, e.g. `[authJwt.verifyToken, authJwt.isAdmin]`. Secret and auth-related copy live in [config/auth.config.js](config/auth.config.js). Employee/team tokens additionally respect a daily expiry window defined in [config/global.config.js](config/global.config.js).

### Request validation

Validators wrap `validatorjs` via [app/helpers/validate.js](app/helpers/validate.js) and are plugged in as route middleware before the controller (see [app/utils/validators/admin/auth.js](app/utils/validators/admin/auth.js) for the pattern: define a rule object, call the shared `validator()` helper, respond with `formatValidationResponse` on failure or call `next()`).

### Response shape

All API responses go through helpers in [app/utils/response.config.js](app/utils/response.config.js): `formatResponse(data, message)` for success, `formatErrorResponse(message)` for errors, `formatValidationResponse(err)` for validation failures. `errorCodes` centralizes status codes used across controllers — reuse these rather than hardcoding `res.status(...)`.

### Models

Plain Sequelize models under `models/`, auto-loaded and associated by [models/index.js](models/index.js) (the standard sequelize-cli bootstrap: reads every `.js` file in the directory, calls `.associate(db)` if present). Access via `require("@models")`, e.g. `db.users`.

### Migrations

233 files under `migrations/`, timestamp-prefixed, standard sequelize-cli `up`/`down` format. Follow the existing naming convention (`YYYYMMDDHHMMSS-description.js`) when adding new ones and generate them with `npx sequelize-cli migration:generate` rather than hand-rolling.

### Real-time / third-party integrations

- `socket.io` server attached to the raw HTTP server in [server.js](server.js); `req.io` is available in all route handlers.
- Pusher client is similarly attached as `req.pusher` (credentials currently hardcoded in server.js, not env-driven — be aware if touching this).
- PDF generation via `puppeteer`/`html-pdf-node` (used for invoices/reports — see recent commit history around `sale.controller.js` and stock report PDFs).
- File uploads: base64 uploads go through the generic `POST /public` endpoint in server.js, which writes directly under the given `pathName` on disk; static file serving is set up per-subfolder (`/public/uploads`, `/public/invoices`, `/public/sales`, etc.).

### Logging

`console.log` is globally monkey-patched in [server.js](server.js) to truncate large strings/objects and avoid `ENOBUFS` crashes on big payloads. A `global.compactLog(...)` helper is also available for controllers that want compact, safe logging of large objects — prefer it over `console.log(largeObject)` in hot paths (e.g. bulk order/sale data).
