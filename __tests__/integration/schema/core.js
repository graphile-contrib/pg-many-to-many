const { lexicographicSortSchema } = require("graphql");
const { withPgClient } = require("../../helpers");
const { makeSchema } = require("postgraphile");
const {
  default: postgraphilePresetAmber,
} = require("postgraphile/presets/amber");
const { makeV4Preset } = require("postgraphile/presets/v4");
const { PgManyToManyPreset } = require("../../../");

exports.test = (schemas, options, setup) => () =>
  withPgClient(async (client) => {
    if (setup) {
      if (typeof setup === "function") {
        await setup(client);
      } else {
        await client.query(setup);
      }
    }
    const { schema } = await makeSchema({
      extends: [
        postgraphilePresetAmber,
        makeV4Preset(options),
        PgManyToManyPreset,
      ],
      pgServices: /* makePgServices(DATABASE_URL, ["app_public"]) */ [
        {
          name: "main",
          adaptor: "@dataplan/pg/adaptors/pg",
          withPgClientKey: "withPgClient",
          pgSettingsKey: "pgSettings",
          pgSettingsForIntrospection: {},
          pgSettings: {},
          schemas: Array.isArray(schemas) ? schemas : [schemas],
          adaptorSettings: {
            poolClient: client,
          },
        },
      ],
    });

    expect(lexicographicSortSchema(schema)).toMatchSnapshot();
  });
