const pkg = require("./package.json");
const PgManyToManyRelationInflectionPlugin = require("./src/PgManyToManyRelationInflectionPlugin.js");
const PgManyToManyRelationPlugin = require("./src/PgManyToManyRelationPlugin.js");
const PgManyToManyRelationEdgeColumnsPlugin = require("./src/PgManyToManyRelationEdgeColumnsPlugin.js");
const PgManyToManyRelationEdgeTablePlugin = require("./src/PgManyToManyRelationEdgeTablePlugin.js");

function PgManyToManyPlugin(builder, options) {
  builder.hook("build", (build) => {
    // Check dependencies
    if (!build.versions) {
      throw new Error(
        `Plugin ${pkg.name}@${pkg.version} requires graphile-build@^4.1.0 in order to check dependencies (current version: ${build.graphileBuildVersion})`
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
    depends("graphile-build-pg", "^4.5.0");

    // Register this plugin
    build.versions = build.extend(build.versions, { [pkg.name]: pkg.version });

    return build;
  });

  PgManyToManyRelationInflectionPlugin(builder, options);
  PgManyToManyRelationPlugin(builder, options);
  PgManyToManyRelationEdgeColumnsPlugin(builder, options);
  PgManyToManyRelationEdgeTablePlugin(builder, options);
}

module.exports = PgManyToManyPlugin;
// Hacks for TypeScript/Babel import
module.exports.default = PgManyToManyPlugin;
Object.defineProperty(module.exports, "__esModule", { value: true });
