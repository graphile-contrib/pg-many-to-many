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
      _manyToManyEdgeRelation(
        this: Inflection,
        details: PgManyToManyRelationDetails
      ): string;
      manyToManyEdgeRelationConnectionField(
        this: Inflection,
        details: PgManyToManyRelationDetails
      ): string;
      manyToManyEdgeRelationListField(
        this: Inflection,
        details: PgManyToManyRelationDetails
      ): string;

      _manyToManyRelation(
        this: Inflection,
        details: PgManyToManyRelationDetails
      ): string;
      manyToManyRelationConnectionField(
        this: Inflection,
        details: PgManyToManyRelationDetails
      ): string;
      manyToManyRelationListField(
        this: Inflection,
        details: PgManyToManyRelationDetails
      ): string;
      manyToManyRelationEdgeType(
        this: Inflection,
        details: PgManyToManyRelationDetailsWithExtras
      ): string;
      manyToManyRelationConnectionType(
        this: Inflection,
        details: PgManyToManyRelationDetailsWithExtras
      ): string;
    }
  }
}
