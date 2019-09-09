/* eslint-disable no-console */
const fs = require("fs");
const util = require("util");
const path = require("path");
const { graphql } = require("graphql");
const { withPgClient } = require("./helpers");
const { createPostGraphileSchema } = require("postgraphile-core");
const { printSchema } = require("graphql/utilities");
const debug = require("debug")("graphile-build:schema");

const readFile = util.promisify(fs.readFile);

const getSqlSchemas = () => fs.readdirSync(path.resolve(__dirname, "schemas"));
const getFixturesForSqlSchema = sqlSchema =>
  fs.readdirSync(
    path.resolve(__dirname, "schemas", sqlSchema, "fixtures", "queries")
  );
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
  return await withPgClient(async pgClient => {
    const data = await readFile(
      path.resolve(__dirname, "schemas", sqlSchema, "data.sql"),
      "utf8"
    );
    await pgClient.query(data);
    const PgManyToManyPlugin = require("../index");
    const gqlSchema = await createPostGraphileSchema(pgClient, [sqlSchema], {
      appendPlugins: [PgManyToManyPlugin],
    });
    debug(`${sqlSchema}: ${printSchema(gqlSchema)}`);
    const query = await readFixtureForSqlSchema(sqlSchema, fixture);
    return await graphql(gqlSchema, query, null, {
      pgClient: pgClient,
    });
  });
};

const sqlSchemas = getSqlSchemas();
describe.each(sqlSchemas)("schema=%s", sqlSchema => {
  const fixtures = getFixturesForSqlSchema(sqlSchema);
  test.each(fixtures)("query=%s", async fixture => {
    const result = await queryResult(sqlSchema, fixture);
    if (result.errors) {
      console.log(result.errors.map(e => e.originalError));
    }
    expect(result).toMatchSnapshot();
  });
});
