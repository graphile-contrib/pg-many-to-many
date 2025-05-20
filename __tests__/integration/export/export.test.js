const { withPgClient, getSchemaPath } = require("../../helpers");
const fs = require("fs");
const util = require("util");
const path = require("path");
const { makeSchema } = require("postgraphile");
const {
  default: postgraphilePresetAmber,
} = require("postgraphile/presets/amber");
const { makeV4Preset } = require("postgraphile/presets/v4");
const { PgManyToManyPreset } = require("../../../");
const pgAdaptor = require("@dataplan/pg/adaptors/pg");
const { exportSchema } = require("graphile-export");

const readFile = util.promisify(fs.readFile);

const exportFileLocation = `${__dirname}/exported-schema.mjs`;

// afterAll(async () => {
//   if (fs.existsSync(exportFileLocation)) {
//     await fs.promises.rm(exportFileLocation);
//   }
// });

test("exports a schema using the 'a' database schema", async () => {
  return withPgClient(async (client) => {
    const data = await readFile(
      path.join(getSchemaPath("a"), "schema.sql"),
      "utf8"
    );
    await client.query(data);

    const { schema } = await makeSchema({
      extends: [postgraphilePresetAmber, makeV4Preset({}), PgManyToManyPreset],
      pgServices: /* makePgServices(DATABASE_URL, ["app_public"]) */ [
        {
          name: "main",
          adaptor: pgAdaptor,
          withPgClientKey: "withPgClient",
          pgSettingsKey: "pgSettings",
          pgSettingsForIntrospection: {},
          pgSettings: {},
          schemas: ["a"],
          adaptorSettings: {
            poolClient: client,
          },
        },
      ],
    });
    try {
      await exportSchema(schema, exportFileLocation, {
        mode: "typeDefs",
      });
    } catch (e) {
      console.error(e);
    }
    const exists = fs.existsSync(exportFileLocation);
    expect(exists).toBe(true);
  });
});
