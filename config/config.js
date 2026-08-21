require("dotenv").config();

const createMySqlConfig = ({ username, password, database, host, port }) => ({
  username,
  password,
  database,
  host,
  port,
  dialect: "mysql",
  timezone: "+05:30",
  logging: false,
  pool: {
    max: 20,
    // min 0 drained the pool when idle, so the first request after a quiet spell
    // paid full connection setup (measured 778 ms vs 60 ms warm).
    min: 5,
    // acquire 60000 meant a request that could not get a connection waited a full
    // minute before failing - which presents to the user as a hang, not an error.
    acquire: 10000,
    idle: 30000,
  },
});

const development = createMySqlConfig({
  username: process.env.DB_DEV_USERNAME || "mysql",
  password: process.env.DB_DEV_PASSWORD ?? "prakriti-dev",
  database: process.env.DB_DEV_DATABASE || "prakriti-dev",
  host:     process.env.DB_DEV_HOST     || "194.238.18.233",
  port:     parseInt(process.env.DB_DEV_PORT) || 3309,
});

const production = createMySqlConfig({
  username: process.env.DB_PROD_USERNAME || "mysql",
  password: process.env.DB_PROD_PASSWORD ?? "prakriti",
  database: process.env.DB_PROD_DATABASE || "prakriti",
  host:     process.env.DB_PROD_HOST     || "194.238.18.233",
  port:     parseInt(process.env.DB_PROD_PORT) || 3307,
});

const test = createMySqlConfig({
  username: process.env.DB_TEST_USERNAME || "mysql",
  password: process.env.DB_TEST_PASSWORD ?? "prakriti-test",
  database: process.env.DB_TEST_DATABASE || "prakriti-test",
  host:     process.env.DB_TEST_HOST     || "194.238.18.233",
  port:     parseInt(process.env.DB_TEST_PORT) || 3308,
});

module.exports = { development, production, test, DEV: development, PROD: production, TEST: test };

