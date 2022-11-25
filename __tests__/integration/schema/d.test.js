const core = require("./core");

test(
  "prints a schema using the 'd' database schema",
  core.test(["d"], {
    skipPlugins: [require("graphile-build-pg").PgConditionArgumentPlugin],
    disableDefaultMutations: true,
    legacyRelations: "omit",
  })
);
