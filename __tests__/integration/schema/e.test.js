const core = require("./core");

test(
  "prints a schema using the 'e' database schema",
  core.test(["e"], {
    appendPlugins: [require("../../../index.js")],
    disableDefaultMutations: true,
    setofFunctionsContainNulls: false,
  })
);
