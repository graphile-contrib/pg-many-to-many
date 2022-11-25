const core = require("./core");

test(
  "prints a schema using the 'e' database schema",
  core.test(["e"], {
    disableDefaultMutations: true,
    setofFunctionsContainNulls: false,
  })
);
