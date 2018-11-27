module.exports = function PgManyToManyPlugin(builder, options) {
  builder.hook("build", build => {
    const pkg = require("./package.json");

    // Check dependencies
    if (!build.versions) {
      throw new Error(
        `Plugin ${pkg.name}@${
          pkg.version
        } requires graphile-build@^4.1.0-rc.2 in order to check dependencies (current version: ${
          build.graphileBuildVersion
        })`
      );
    }
    const depends = (name, range) => {
      if (!build.hasVersion(name, range)) {
        throw new Error(
          `Plugin ${pkg.name}@${pkg.version} requires ${name}@${range} (${
            build.versions[name]
              ? `current version: ${build.versions[name]}`
              : "not found"
          })`
        );
      }
    };
    depends("graphile-build-pg", "^4.1.0-rc.2");

    // Register this plugin
    build.versions = build.extend(build.versions, { [pkg.name]: pkg.version });

    return build;
  });

  require("./src/PgManyToManyRelationPlugin.js")(builder, options);

  // FIXME: Key columns in junction table should not be exposed as edge fields
  // FIXME: SQL for resolving edge columns isn't working yet
  require("./src/PgManyToManyEdgeColumnsPlugin.js")(builder, options);
};
