const core = require("./core");

test(
  "prints a schema with `ignoreIndexes: false`",
  core.test(["p"], {
    appendPlugins: [require("../../../index.js")],
    disableDefaultMutations: true,
    legacyRelations: "omit",
    ignoreIndexes: false,
  })
);
