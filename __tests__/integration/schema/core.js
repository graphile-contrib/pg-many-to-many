const { withPgClient } = require("../../helpers");
const { createPostGraphileSchema } = require("postgraphile-core");
const { parse, buildASTSchema } = require("graphql");
const { lexicographicSortSchema, printSchema } = require("graphql/utilities");

exports.test = (schemas, options, setup) => () =>
  withPgClient(async (client) => {
    if (setup) {
      if (typeof setup === "function") {
        await setup(client);
      } else {
        await client.query(setup);
      }
    }
    const schema = await createPostGraphileSchema(client, schemas, options);
    expect(printSchemaOrdered(schema)).toMatchSnapshot();
  });

function printSchemaOrdered(originalSchema) {
  // Clone schema so we don't damage anything
  const schema = buildASTSchema(parse(printSchema(originalSchema)));

  return printSchema(lexicographicSortSchema(schema));
}
