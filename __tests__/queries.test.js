const fs = require("fs");
const util = require("util");
const path = require("path");
const { grafastGraphql: graphql } = require("grafast");
const { withPgClient, getSchemaPath, getSchemaConfig } = require("./helpers");
const { printSchema } = require("graphql");
const debug = require("debug")("graphile-build:schema");
const { makeSchema } = require("postgraphile");
const {
  default: postgraphilePresetAmber,
} = require("postgraphile/presets/amber");
const { makeV4Preset } = require("postgraphile/presets/v4");
const { PgManyToManyPreset } = require("../");
const pgAdaptor = require("@dataplan/pg/adaptors/pg");

const readFile = util.promisify(fs.readFile);

const getQueriesPath = (sqlSchema) =>
  path.join(getSchemaPath(sqlSchema), "fixtures", "queries");

const getSqlSchemas = () =>
  fs.readdirSync(path.resolve(__dirname, "schemas")).sort();
const getFixturesForSqlSchema = (sqlSchema) =>
  fs.existsSync(getQueriesPath(sqlSchema))
    ? fs.readdirSync(getQueriesPath(sqlSchema)).sort()
    : [];
const readFixtureForSqlSchema = (sqlSchema, fixture) =>
  readFile(path.join(getQueriesPath(sqlSchema), fixture), "utf8");

const queryResult = async (sqlSchema, fixture) => {
  return await withPgClient(async (pgClient) => {
    const data = await readFile(
      path.join(getSchemaPath(sqlSchema), "data.sql"),
      "utf8"
    );
    await pgClient.query(data);

    const config = await getSchemaConfig(sqlSchema);

    const { schema, resolvedPreset } = await makeSchema({
      extends: [
        postgraphilePresetAmber,
        makeV4Preset(config),
        PgManyToManyPreset,
      ],
      pgServices: /* makePgServices(DATABASE_URL, ["app_public"]) */ [
        {
          name: "main",
          adaptor: pgAdaptor,
          pgSettingsKey: "pgSettings",
          pgSettings: {},
          withPgClientKey: "withPgClient",
          withPgClient,
          pgSettingsForIntrospection: {},
          schemas: [sqlSchema],
          adaptorSettings: {
            poolClient: pgClient,
          },
        },
      ],
    });

    debug(`${sqlSchema}: ${printSchema(schema)}`);
    const query = await readFixtureForSqlSchema(sqlSchema, fixture);
    const args = {
      schema,
      resolvedPreset,
      requestContext: {},
      source: query,
    };

    return await graphql(args);
  });
};

const sqlSchemas = getSqlSchemas();
describe.each(sqlSchemas)("schema=%s", (sqlSchema) => {
  const fixtures = getFixturesForSqlSchema(sqlSchema);
  if (fixtures.length > 0) {
    test.each(fixtures)("query=%s", async (fixture) => {
      const result = await queryResult(sqlSchema, fixture);
      if (result.errors) {
        console.log(result.errors.map((e) => e.originalError ?? e));
      }
      expect(result).toMatchSnapshot();
    });
  }
});
