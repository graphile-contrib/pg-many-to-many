/* eslint-disable no-console */
const fs = require("fs");
const util = require("util");
const path = require("path");
const { grafastGraphql: graphql, hookArgs } = require("grafast");
const { withPgClient } = require("./helpers");
const { printSchema } = require("graphql");
const debug = require("debug")("graphile-build:schema");
const { makeSchema } = require("postgraphile");
const {
  default: postgraphilePresetAmber,
} = require("postgraphile/presets/amber");
const { makeV4Preset } = require("postgraphile/presets/v4");
const { PgManyToManyPreset } = require("../");

const readFile = util.promisify(fs.readFile);

const getSqlSchemas = () =>
  fs.readdirSync(path.resolve(__dirname, "schemas")).sort();
const getFixturesForSqlSchema = (sqlSchema) =>
  fs.existsSync(
    path.resolve(__dirname, "schemas", sqlSchema, "fixtures", "queries")
  )
    ? fs
        .readdirSync(
          path.resolve(__dirname, "schemas", sqlSchema, "fixtures", "queries")
        )
        .sort()
    : [];
const readFixtureForSqlSchema = (sqlSchema, fixture) =>
  readFile(
    path.resolve(
      __dirname,
      "schemas",
      sqlSchema,
      "fixtures",
      "queries",
      fixture
    ),
    "utf8"
  );

const queryResult = async (sqlSchema, fixture) => {
  return await withPgClient(async (pgClient) => {
    const data = await readFile(
      path.resolve(__dirname, "schemas", sqlSchema, "data.sql"),
      "utf8"
    );
    await pgClient.query(data);

    const { schema, resolvedPreset } = await makeSchema({
      extends: [postgraphilePresetAmber, makeV4Preset({}), PgManyToManyPreset],
      pgConfigs: /* makePgConfigs(DATABASE_URL, ["app_public"]) */ [
        {
          name: "main",
          adaptor: "@dataplan/pg/adaptors/node-postgres",
          withPgClientKey: "withPgClient",
          pgSettingsKey: "pgSettings",
          pgSettingsForIntrospection: {},
          pgSettings: {},
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
      source: query,
    };
    await hookArgs(
      args,
      {
        /* optional details for your context callback(s) to use */
      },
      resolvedPreset
    );

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
