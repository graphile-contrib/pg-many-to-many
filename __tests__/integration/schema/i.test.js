const { getSchemaConfig } = require("../../helpers");
const core = require("./core");

test("prints a schema using the 'i' database schema", async () => {
  const config = await getSchemaConfig("i");
  return core.test(["i"], config)();
});
