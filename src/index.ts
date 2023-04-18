import type {} from "graphile-config";
import { PgManyToManyRelationInflectionPlugin } from "./PgManyToManyRelationInflectionPlugin.js";
import { PgManyToManyRelationPlugin } from "./PgManyToManyRelationPlugin.js";
import { PgManyToManyRelationEdgeAttributesPlugin } from "./PgManyToManyRelationEdgeAttributesPlugin.js";
import { PgManyToManyRelationEdgeTablePlugin } from "./PgManyToManyRelationEdgeTablePlugin.js";
export type {
  PgTableResource,
  PgManyToManyRelationDetails,
  PgManyToManyRelationDetailsWithExtras,
} from "./interfaces";

export const PgManyToManyPreset: GraphileConfig.Preset = {
  plugins: [
    PgManyToManyRelationInflectionPlugin,
    PgManyToManyRelationPlugin,
    PgManyToManyRelationEdgeAttributesPlugin,
    PgManyToManyRelationEdgeTablePlugin,
  ],
};

export {
  PgManyToManyRelationInflectionPlugin,
  PgManyToManyRelationPlugin,
  PgManyToManyRelationEdgeAttributesPlugin,
  PgManyToManyRelationEdgeTablePlugin,
};
