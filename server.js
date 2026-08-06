const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const fs = require('fs');
const Pusher = require("pusher");
require('module-alias/register');

global.compactLog = () => {};
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// Ensure logs directory exists
fs.mkdirSync('logs', { recursive: true });

// ── Graceful shutdown ────────────────────────────────────────────
let _isShuttingDown = false;
const _logErr = (tag, err) => {
  const line = `[${tag}] ${new Date().toISOString()} ${err && err.message ? err.stack || err.message : String(err)}\n`;
  try { fs.appendFileSync('logs/error.log', line); } catch (_) {}
};

process.on('uncaughtException', (err) => {
  _logErr('uncaughtException', err);
  // Exit so process manager (PM2/systemd) can restart cleanly
  if (!_isShuttingDown) {
    _isShuttingDown = true;
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason) => {
  // Log only — unhandled promise rejections are non-fatal
  _logErr('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
});

const gracefulShutdown = (signal) => {
  if (_isShuttingDown) return;
  _isShuttingDown = true;
  _logErr('shutdown', new Error(`Received ${signal}`));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref(); // force-exit after 10s
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// ── App setup ────────────────────────────────────────────────────
const app = express();
let compression;
try {
  compression = require('compression');
} catch (err) {
  compression = null;
  console.warn('Warning: compression module not installed. Response compression is disabled. Run `npm install compression` to enable it.');
}
if (compression) app.use(compression());
app.use(helmet());

const corsConfig = require('./config/cors.config');
app.use(cors(corsConfig.corsOptions));

app.use(bodyParser.json({ limit: "15mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/public/uploads',          express.static('public/uploads'));
app.use('/public/uploads/products', express.static('public/uploads/products'));
app.use('/public/user_image',       express.static('public/user_image'));
app.use('/public/invoices',         express.static('public/invoices'));
app.use('/public/purchases',        express.static('public/purchases'));
app.use('/public/sales',            express.static('public/sales'));
app.use('/public/images',           express.static('public/images'));
app.use('/public/salaries',         express.static('public/salaries'));
app.use('/public/reports',          express.static('public/reports'));

const swaggeroptions = {
  definition: { openapi: '3.0.0', info: { title: 'Ratan Vihar API', version: '1.0.0' } },
  apis: ['./app/routes/app/*.routes.js'],
};
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerJsdoc(swaggeroptions), { explorer: true }));

// ── Pusher ───────────────────────────────────────────────────────
const pusher = new Pusher({
  appId: "1331621",
  key: "09f950cd54a3bae697ec",
  secret: "675fe2d11d89d687f2f0",
  cluster: "ap2",
  useTLS: true,
});

// ── Request logger ───────────────────────────────────────────────
const { demoLogger } = require('./app/middlewares');
app.use(demoLogger);

// ── Health check ─────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ message: "Welcome to our PRAKRITI API application server." }));
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime(), env: process.env.NODE_ENV }));

// ── File upload ──────────────────────────────────────────────────
app.post("/public", (req, res) => {
  try {
    const { base64Image, pathName, fileName } = req.body;
    if (!base64Image || !pathName || !fileName) {
      return res.status(400).json({ success: false, message: "Missing required fields: base64Image, pathName, fileName" });
    }
    const fullDirPath = path.join(__dirname, pathName);
    if (!fs.existsSync(fullDirPath)) fs.mkdirSync(fullDirPath, { recursive: true });
    fs.writeFileSync(path.join(fullDirPath, fileName), Buffer.from(base64Image, "base64"));
    res.json({ success: true, file_name: fileName, path: pathName.replace(/\\/g, "/") + "/" + fileName });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to upload file: " + error.message });
  }
});

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header('Access-Control-Allow-Methods', 'DELETE, PUT, POST, GET');
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Socket.io ────────────────────────────────────────────────────
const server = http.createServer(app);
const io = socketIO(server);

app.use((req, res, next) => { req.io = io; req.pusher = pusher; next(); });
io.sockets.on('connection', (socket) => { socket.on('echo', () => {}); });

// ── Routes ───────────────────────────────────────────────────────
require("./app/routes/superadmin.routes")(app, express);
require("./app/routes/admin.routes")(app, express);
require("./app/routes/distributor.routes")(app, express);
require("./app/routes/sales_executive.routes")(app, express);
require("./app/routes/retailer.routes")(app, express);
require("./app/routes/customer.routes")(app, express);
require("./app/routes/supplier.routes")(app, express);
require("./app/routes/manager.routes")(app, express);
require("./app/routes/employee.routes")(app, express);
require("./app/routes/team.routes")(app, express);

// ── Global error handler (catches errors thrown inside route handlers) ──
app.use((err, req, res, next) => {
  _logErr('expressError', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

// ── Timezone ─────────────────────────────────────────────────────
process.env.TZ = "Asia/Calcutta";

// ── Start server ─────────────────────────────────────────────────
const PORT = process.env.PORT || 9090;

server.listen(PORT, () => {
  const env = process.env.NODE_ENV || 'development';
  console.log(`[${new Date().toISOString()}] Server running on port ${PORT} (${env})`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Port busy — log and exit so process manager restarts after old process dies
    _logErr('EADDRINUSE', new Error(`Port ${PORT} is already in use. Exiting so process manager can retry.`));
    console.error(`Port ${PORT} already in use. Exiting.`);
    process.exit(1);
  } else {
    _logErr('listenError', err);
    process.exit(1);
  }
});
