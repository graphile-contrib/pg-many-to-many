const pg = require("pg");
const fs = require("fs");
const util = require("util");
const path = require("path");

const readFile = util.promisify(fs.readFile);

// This test suite can be flaky. Increase it’s timeout.
jest.setTimeout(1000 * 20);

const withPgClient = async (url, fn) => {
  if (!fn) {
    fn = url;
    url = process.env.TEST_DATABASE_URL;
  }
  const pgPool = new pg.Pool({ connectionString: url });
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


const getSchemaPath = (sqlSchema) =>
  path.resolve(__dirname, "schemas", sqlSchema);

const getSchemaConfig = async (sqlSchema) => {
  const configPath = path.join(getSchemaPath(sqlSchema), "config.json");
  if (fs.existsSync(configPath)) {
    const configJson = await readFile(
      path.join(getSchemaPath(sqlSchema), "config.json"),
      "utf8"
    );
    return JSON.parse(configJson);
  }
  return {};
};

exports.withPgClient = withPgClient;
exports.getSchemaPath = getSchemaPath;
exports.getSchemaConfig = getSchemaConfig;
