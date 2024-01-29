const Pool = require("pg").Pool;

const pool = new Pool({
  user: process.env.SERVER_USER,
  password: process.env.SERVER_PASSWORD,
  host: process.env.SERVER_HOST,
  port: 5432,
  database: process.env.SERVER_DATABASE,
});

module.exports = pool;
