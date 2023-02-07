import type {
  PgSource,
  PgSourceRelation,
  PgTypeColumns,
  PgSourceUnique,
} from "@dataplan/pg";

// A generic table source with columns, uniques, relations and no parameters.
export type PgTableSource = PgSource<
  PgTypeColumns,
  PgSourceUnique[],
  {
    [relationName: string]: PgSourceRelation<
      PgTypeColumns<string>,
      PgTypeColumns<string>
    >;
  }
>;

export interface PgManyToManyRelationDetails {
  leftTable: PgTableSource;
  leftRelationName: string;
  junctionTable: PgTableSource;
  rightRelationName: string;
  rightTable: PgTableSource;
  allowsMultipleEdgesToNode: boolean;
}

export interface PgManyToManyRelationDetailsWithExtras
  extends PgManyToManyRelationDetails {
  leftTableTypeName: string;
}

declare global {
  namespace GraphileBuild {
    interface ScopeObjectFieldsField {
      isPgManyToManyRelationEdgeColumnField?: boolean;

      isPgManyToManyRelationField?: boolean;
      pgManyToManyRightTable?: PgSource<any, any, any, any>;

      isPgManyToManyRelationEdgeTableField?: boolean;
      pgManyToManyJunctionTable?: PgSource<any, any, any, any>;
    }

    interface ScopeObject {
      isPgManyToManyEdgeType?: boolean;
      pgManyToManyRelationship?: PgManyToManyRelationDetails;
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
