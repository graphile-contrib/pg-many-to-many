const core = require("./core");

test(
  "prints a schema using the 'c' database schema",
  core.test(["c"], {
    skipPlugins: [require("graphile-build-pg").PgConditionArgumentPlugin],
    disableDefaultMutations: true,
    legacyRelations: "omit",
  })
);
