const express = require("express");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const http = require('http');
const https = require(`https`);
const socketIO = require('socket.io');
const path = require('path');
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const fs = require('fs');
const Pusher = require("pusher");
require('module-alias/register');
require('dotenv').config();

// Keep original console.log reference available to compactLog
const _origLog = console.log.bind(console);

// Install a global safe console.log wrapper to avoid stdout buffer overflow (ENOBUFS)
// Truncates very large strings and compactly represents objects.
(() => {
  console.log = (...args) => {
    try {
      const out = args
        .map((a) => {
          if (a === null || a === undefined) return String(a);
          if (typeof a === 'string') return a.length > 2000 ? a.slice(0, 2000) + '...[truncated]' : a;
          if (typeof a === 'object') {
            if (a && a.id !== undefined) return `[obj id=${a.id}]`;
            try {
              return JSON.stringify(a, (k, v) => {
                if (typeof v === 'string' && v.length > 500) return v.slice(0, 500) + '...[truncated]';
                return v;
              });
            } catch (e) {
              return '[object]';
            }
          }
          return a;
        })
        .join(' ');
      _origLog(out);
    } catch (e) {
      try { _origLog('[log error]'); } catch (e) {}
    }
  };
})();

// Provide a global compactLog helper for controllers to produce small, safe logs.
global.compactLog = (...args) => {
  try {
    const fmt = args
      .map((a) => {
        if (a === null || a === undefined) return String(a);
        if (typeof a === 'string') return a.length > 2000 ? a.slice(0, 2000) + '...[truncated]' : a;
        if (Array.isArray(a)) return `[Array len=${a.length}]`;
        if (typeof a === 'object') {
          if (a && a.id !== undefined) return `[obj id=${a.id}]`;
          try { return `[object keys=${Object.keys(a).length}]`; } catch (e) { return '[object]'; }
        }
        return String(a);
      })
      .join(' ');
    _origLog(fmt);
  } catch (e) {
    try { _origLog('[compactLog error]'); } catch (e) {}
  }
};

const app = express();
app.use(helmet());
const router = express.Router();

const corsConfig = require('./config/cors.config');
app.use(cors(corsConfig.corsOptions));
// app.use(cors())

// parse requests of content-type - application/json
app.use(bodyParser.json({limit: "50mb"}));

// parse requests of content-type - application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/public/uploads', express.static('public/uploads'));
app.use('/public/uploads/products', express.static('public/uploads/products'));
app.use('/public/user_image', express.static('public/user_image'));
app.use('/public/invoices', express.static('public/invoices'));
app.use('/public/purchases', express.static('public/purchases'));
app.use('/public/sales', express.static('public/sales'));
app.use('/public/images', express.static('public/images'));
app.use('/public/salaries', express.static('public/salaries'));
app.use('/public/reports', express.static('public/reports'));

const swaggeroptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Ratan Vihar API',
      version: '1.0.0',
    },
  },
  apis: ['./app/routes/app/*.routes.js'], // files containing annotations as above
};

const openapiSpecification = swaggerJsdoc(swaggeroptions);
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(openapiSpecification, { explorer: true })
);

/**
 * Pusher initialize
 */
const pusher = new Pusher({
  appId: "1331621", //"1495977",
  key: "09f950cd54a3bae697ec", //"f618012d7514b9b54d03",
  secret: "675fe2d11d89d687f2f0", //"4574eb2b2610191007ec",
  cluster: "ap2",
  useTLS: true
});


// Attach io and pusher to requests later, after io is initialized.
// (This must be done after the HTTP server and socket.io are created.)


/**
 * log routes & time taken
 */
const { demoLogger } = require('./app/middlewares');
app.use(demoLogger);

// simple route
app.get("/", (req, res) => {
  res.json({ message: "Welcome to our PRAKRITI API application server."});
});

// (No temporary /api test routes remain)

// File upload endpoint
app.post("/public", (req, res) => {
  try {
    const { base64Image, pathName, fileName } = req.body;
    
    if (!base64Image || !pathName || !fileName) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: base64Image, pathName, fileName"
      });
    }

    const fs = require("fs");
    const fullDirPath = path.join(__dirname, pathName);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(fullDirPath)) {
      fs.mkdirSync(fullDirPath, { recursive: true });
    }

    // Write file
    const filePath = path.join(fullDirPath, fileName);
    const buffer = Buffer.from(base64Image, "base64");
    fs.writeFileSync(filePath, buffer);

    // Return relative path for storage in database (using forward slashes for consistency)
    const relativePath = pathName.replace(/\\/g, "/") + "/" + fileName;
    
    res.json({
      success: true,
      file_name: fileName,
      path: relativePath
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload file: " + error.message
    });
  }
});

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header('Access-Control-Allow-Methods', 'DELETE, PUT, POST, GET');
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  if ('OPTIONS' == req.method) {
    res.sendStatus(200);
  }
  else {
    next();
  }
});

/**
 * Socket Server
 */
let server = http.createServer(app);
// let server;
// if(process.env.IS_SSL_ON == "true"){
//   const https_options = {
//     key: fs.readFileSync( process.env.SSLCertificateKey),
//     cert: fs.readFileSync(process.env.SSLCertificateFile)
//   };
//   server = https.createServer(https_options, app);
// }else{
//   server = http.createServer(app);
// }

let io = socketIO(server);

// Now that io exists, attach it and pusher to incoming requests so
// controllers and middleware can use `req.io` and `req.pusher` safely.
app.use((req, res, next) => {
  req.io = io;
  req.pusher = pusher;
  return next();
});

io.sockets.on('connection', function (socket) {
  socket.on('echo', function (data) {

  });
});

/**
 * Routes
 */
//super admin
require("./app/routes/superadmin.routes")(app, express);

//admin
require("./app/routes/admin.routes")(app, express);

//distributor
require("./app/routes/distributor.routes")(app, express);

//sales executive
require("./app/routes/sales_executive.routes")(app, express);

//retailer
require("./app/routes/retailer.routes")(app, express);

//customer
require("./app/routes/customer.routes")(app, express);

//supplier
require("./app/routes/supplier.routes")(app, express);

//manager
require("./app/routes/manager.routes")(app, express);

//employee
require("./app/routes/employee.routes")(app, express);

//team
require("./app/routes/team.routes")(app, express);


//set timezone
process.env.TZ = "Asia/Calcutta";

// set port, listen for requests
const PORT = process.env.PORT;
//server.listen(PORT)
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
}).on('error', (error) => { 
  console.log(`Something wrong`, error);
  log = JSON.stringify(error);
  fs.appendFile("logs/request_logs.txt", log + "\n", err => {
    if (err) {
      console.log(err);
    }
  });
});

