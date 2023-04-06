import type {
  PgResource,
  PgResourceUnique,
  PgRegistry,
  PgCodecWithColumns,
} from "@dataplan/pg";

// A generic table resource with columns, uniques, relations and no parameters.
export type PgTableResource = PgResource<
  string,
  PgCodecWithColumns,
  PgResourceUnique[],
  undefined,
  PgRegistry
>;

export interface PgManyToManyRelationDetails {
  leftTable: PgTableResource;
  leftRelationName: string;
  junctionTable: PgTableResource;
  rightRelationName: string;
  rightTable: PgTableResource;
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
      pgManyToManyRightTable?: PgResource;

      isPgManyToManyRelationEdgeTableField?: boolean;
      pgManyToManyJunctionTable?: PgResource;
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
