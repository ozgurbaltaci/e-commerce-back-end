const Pool = require("pg").Pool;

const pool = new Pool({
  user: "nrkusply",
  // password: "test",
  // host: "localhost",
  password: "RabpioFCEOF5pi-9Si_CK9MK2uhAZj01",
  host: "batyr.db.elephantsql.com",
  port: 5432,
  database: "nrkusply",
});

module.exports = pool;
