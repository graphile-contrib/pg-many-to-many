const { getSchemaConfig } = require("../../helpers");
const core = require("./core");

test("prints a schema using the 'j' database schema", async () => {
  const config = await getSchemaConfig("j");
  return core.test(["j"], config)();
});
