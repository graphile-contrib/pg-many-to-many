const pg = require("pg");
const fs = require("fs");
const util = require("util");
const path = require("path");
const pgConnectionString = require("pg-connection-string");

const readFile = util.promisify(fs.readFile);

// This test suite can be flaky. Increase it’s timeout.
jest.setTimeout(1000 * 20);

const withPgClient = async (url, fn) => {
  if (!fn) {
    fn = url;
    url = process.env.TEST_DATABASE_URL;
  }
  const pgPool = new pg.Pool(pgConnectionString.parse(url));
  let client;
  try {
    client = await pgPool.connect();
    await client.query("begin");
    await client.query("set local timezone to '+04:00'");
    const result = await fn(client);
    await client.query("rollback");
    return result;
  } finally {
    try {
      await client.release();
    } catch (e) {
      console.error("Error releasing pgClient", e); // eslint-disable-line no-console
    }
    await pgPool.end();
  }
};

const withDbFromUrl = async (url, fn) => {
  return withPgClient(url, async client => {
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE;");
      return fn(client);
    } finally {
      await client.query("COMMIT;");
    }
  });
};

const withRootDb = fn => withDbFromUrl(process.env.TEST_DATABASE_URL, fn);

let prepopulatedDBKeepalive;

const populateDatabase = async client => {
  const sqlSchemas = fs.readdirSync(path.resolve(__dirname, "schemas"));
  await Promise.all(
    sqlSchemas.map(async sqlSchema => {
      const sqlData = await readFile(
        path.resolve(__dirname, "schemas", sqlSchema, "data.sql"),
        "utf8"
      );
      await client.query(sqlData);
    })
  );
  return {};
};

const withPrepopulatedDb = async fn => {
  if (!prepopulatedDBKeepalive) {
    throw new Error("You must call setup and teardown to use this");
  }
  const { client, vars } = prepopulatedDBKeepalive;
  if (!vars) {
    throw new Error("No prepopulated vars");
  }
  let err;
  try {
    await fn(client, vars);
  } catch (e) {
    err = e;
  }
  try {
    await client.query("ROLLBACK TO SAVEPOINT pristine;");
  } catch (e) {
    err = err || e;
    console.error("ERROR ROLLING BACK", e.message); // eslint-disable-line no-console
  }
  if (err) {
    throw err;
  }
};

withPrepopulatedDb.setup = done => {
  if (prepopulatedDBKeepalive) {
    throw new Error("There's already a prepopulated DB running");
  }
  let res;
  let rej;
  prepopulatedDBKeepalive = new Promise((resolve, reject) => {
    res = resolve;
    rej = reject;
  });
  prepopulatedDBKeepalive.resolve = res;
  prepopulatedDBKeepalive.reject = rej;
  withRootDb(async client => {
    prepopulatedDBKeepalive.client = client;
    try {
      prepopulatedDBKeepalive.vars = await populateDatabase(client);
    } catch (e) {
      console.error("FAILED TO PREPOPULATE DB!", e.message); // eslint-disable-line no-console
      return done(e);
    }
    await client.query("SAVEPOINT pristine;");
    done();
    return prepopulatedDBKeepalive;
  });
};

withPrepopulatedDb.teardown = () => {
  if (!prepopulatedDBKeepalive) {
    throw new Error("Cannot tear down null!");
  }
  prepopulatedDBKeepalive.resolve(); // Release DB transaction
  prepopulatedDBKeepalive = null;
};

exports.withRootDb = withRootDb;
exports.withPrepopulatedDb = withPrepopulatedDb;
exports.withPgClient = withPgClient;
