const PgManyToManyRelationInflectionPlugin = require("./src/PgManyToManyRelationInflectionPlugin.js");
const PgManyToManyRelationPlugin = require("./src/PgManyToManyRelationPlugin.js");
const PgManyToManyRelationEdgeColumnsPlugin = require("./src/PgManyToManyRelationEdgeColumnsPlugin.js");
const PgManyToManyRelationEdgeTablePlugin = require("./src/PgManyToManyRelationEdgeTablePlugin.js");

/** @type {GraphileConfig.Preset} */
const preset = {
  plugins: [
    PgManyToManyRelationInflectionPlugin,
    PgManyToManyRelationPlugin,
    PgManyToManyRelationEdgeColumnsPlugin,
    PgManyToManyRelationEdgeTablePlugin,
  ],
};

module.exports = preset;
