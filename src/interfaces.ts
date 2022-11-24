import type {
  PgSource,
  PgSourceRelation,
  PgTypeCodec,
  PgTypeColumn,
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
