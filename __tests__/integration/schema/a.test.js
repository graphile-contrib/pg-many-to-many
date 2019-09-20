const core = require("./core");

test(
  "prints a schema using the 'a' database schema",
  core.test(["a"], {
    skipPlugins: [require("graphile-build-pg").PgConnectionArgCondition],
    appendPlugins: [require("../../../index.js")],
    disableDefaultMutations: true,
    legacyRelations: "omit",
  })
);
