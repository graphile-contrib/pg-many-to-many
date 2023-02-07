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
