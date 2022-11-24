import { PgManyToManyRelationInflectionPlugin } from "./PgManyToManyRelationInflectionPlugin.js";
import { PgManyToManyRelationPlugin } from "./PgManyToManyRelationPlugin.js";
import { PgManyToManyRelationEdgeColumnsPlugin } from "./PgManyToManyRelationEdgeColumnsPlugin.js";
import { PgManyToManyRelationEdgeTablePlugin } from "./PgManyToManyRelationEdgeTablePlugin.js";

export const PgManyToManyPreset: GraphileConfig.Preset = {
  plugins: [
    PgManyToManyRelationInflectionPlugin,
    PgManyToManyRelationPlugin,
    PgManyToManyRelationEdgeColumnsPlugin,
    PgManyToManyRelationEdgeTablePlugin,
  ],
};
