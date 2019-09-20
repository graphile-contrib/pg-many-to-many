const core = require("./core");

test(
  "prints a schema using the 'd' database schema",
  core.test(["d"], {
    skipPlugins: [require("graphile-build-pg").PgConnectionArgCondition],
    appendPlugins: [require("../../../index.js")],
    disableDefaultMutations: true,
    legacyRelations: "omit",
  })
);
