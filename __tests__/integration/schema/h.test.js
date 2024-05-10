const { getSchemaConfig } = require("../../helpers");
const core = require("./core");

test("prints a schema using the 'h' database schema", async () => {
  const config = await getSchemaConfig("h");
  return core.test(["h"], config)();
});
