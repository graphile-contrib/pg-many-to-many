const core = require("./core");

test(
  "prints a schema using the 'b' database schema",
  core.test(["b"], {
    skipPlugins: [require("graphile-build-pg").PgConnectionArgCondition],
    appendPlugins: [require("../../../index.js")],
    disableDefaultMutations: true,
    legacyRelations: "omit",
  })
);
