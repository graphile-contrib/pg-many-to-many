import { PgSource } from "@dataplan/pg";
import type {} from "graphile-config";
import type {} from "postgraphile";
import { PgManyToManyRelationInflectionPlugin } from "./PgManyToManyRelationInflectionPlugin.js";
import { PgManyToManyRelationPlugin } from "./PgManyToManyRelationPlugin.js";
import { PgManyToManyRelationEdgeColumnsPlugin } from "./PgManyToManyRelationEdgeColumnsPlugin.js";
import { PgManyToManyRelationEdgeTablePlugin } from "./PgManyToManyRelationEdgeTablePlugin.js";
import {
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
  PgTableSource,
  PgManyToManyRelationDetails,
  PgManyToManyRelationDetailsWithExtras,
};

declare global {
  namespace GraphileBuild {
    interface ScopeObjectFieldsField {
      isPgManyToManyRelationEdgeColumnField?: boolean;
    }
  }
}

declare global {
  namespace GraphileBuild {
    interface ScopeObject {
      isPgManyToManyEdgeType?: boolean;
      pgManyToManyRelationship?: PgManyToManyRelationDetails;
    }
    interface ScopeObjectFieldsField {
      isPgManyToManyRelationField?: boolean;
      pgManyToManyRightTable?: PgSource<any, any, any, any>;
    }
  }
}

declare global {
  namespace GraphileBuild {
    interface ScopeObjectFieldsField {
      isPgManyToManyRelationEdgeTableField?: boolean;
      pgManyToManyJunctionTable?: PgSource<any, any, any, any>;
    }

    interface Inflection {
      _manyToManyEdgeRelationFieldName(
        this: Inflection,
        details: PgManyToManyRelationDetails
      ): string;
      manyToManyEdgeRelationConnection(
        this: Inflection,
        details: PgManyToManyRelationDetails
      ): string;
      manyToManyEdgeRelationList(
        this: Inflection,
        details: PgManyToManyRelationDetails
      ): string;
    }
  }
}

declare global {
  namespace GraphileBuild {
    interface Inflection {
      manyToManyRelationByKeys(
        this: Inflection,
        details: PgManyToManyRelationDetails
      ): string;
      manyToManyRelationByKeysSimple(
        this: Inflection,
        details: PgManyToManyRelationDetails
      ): string;
      manyToManyRelationEdge(
        this: Inflection,
        details: PgManyToManyRelationDetailsWithExtras
      ): string;
      manyToManyRelationConnection(
        this: Inflection,
        details: PgManyToManyRelationDetailsWithExtras
      ): string;
      manyToManyRelationSubqueryName(
        this: Inflection,
        details: PgManyToManyRelationDetailsWithExtras
      ): string;
    }
  }
}
