const core = require("./core");

test(
  "prints a schema with the many-to-many plugin",
  core.test(["g"], {
    appendPlugins: [require("../../../index.js")],
    disableDefaultMutations: true,
    legacyRelations: "omit",
  })
);
