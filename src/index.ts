import type {} from "graphile-config";
import { PgManyToManyRelationInflectionPlugin } from "./PgManyToManyRelationInflectionPlugin.js";
import { PgManyToManyRelationPlugin } from "./PgManyToManyRelationPlugin.js";
import { PgManyToManyRelationEdgeColumnsPlugin } from "./PgManyToManyRelationEdgeColumnsPlugin.js";
import { PgManyToManyRelationEdgeTablePlugin } from "./PgManyToManyRelationEdgeTablePlugin.js";
export type {
  PgTableSource,
  PgManyToManyRelationDetails,
  PgManyToManyRelationDetailsWithExtras,
} from "./interfaces";

export const PgManyToManyPreset: GraphileConfig.Preset = {
  plugins: [
    PgManyToManyRelationInflectionPlugin,
    PgManyToManyRelationPlugin,
    PgManyToManyRelationEdgeColumnsPlugin,
    PgManyToManyRelationEdgeTablePlugin,
  ],
};

export {
  PgManyToManyRelationInflectionPlugin,
  PgManyToManyRelationPlugin,
  PgManyToManyRelationEdgeColumnsPlugin,
  PgManyToManyRelationEdgeTablePlugin,
};
