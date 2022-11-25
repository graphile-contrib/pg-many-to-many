const core = require("./core");

test(
  "prints a schema with `ignoreIndexes: false`",
  core.test(["p"], {
    disableDefaultMutations: true,
    legacyRelations: "omit",
    ignoreIndexes: false,
  })
);
