import {
  PgSource,
  PgSourceBuilder,
  PgSourceRelation,
  PgSourceUnique,
  PgTypeCodec,
  PgTypeColumns,
  resolveSource,
} from "@dataplan/pg";
import { PgTableSource } from "./interfaces";
import { PgManyToManyRelationPlugin } from "./PgManyToManyRelationPlugin";
import { PgManyToManyRelationDetails } from "./PgManyToManyRelationInflectionPlugin";

function arraysAreEqual<A extends readonly any[]>(
  array1: A,
  array2: readonly any[]
): boolean {
  return (
    array1.length === array2.length && array1.every((el, i) => array2[i] === el)
  );
}
const defaultBehavior = "manyToMany select";

// Given a `leftTable`, trace through the foreign key relations
// and identify a `junctionTable` and `rightTable`.
// Returns a list of data objects for these many-to-many relationships.
export default function manyToManyRelationships(
  leftTable: PgTableSource,
  build: GraphileBuild.Build
): PgManyToManyRelationDetails[] {
  return Object.entries(leftTable.getRelations()).reduce(
    (memoLeft, [leftRelationName, junctionLeftRelation]) => {
      const relationBehavior = build.pgGetBehavior(
        junctionLeftRelation.extensions
      );
      if (
        !build.behavior.matches(relationBehavior, "manyToMany", defaultBehavior)
      ) {
        return memoLeft;
      }

      const junctionTable: PgTableSource = resolveSource(
        junctionLeftRelation.source
      );

      const junctionBehavior = build.pgGetBehavior(
        junctionLeftRelation.extensions
      );
      if (
        !build.behavior.matches(
          junctionBehavior,
          "manyToMany",
          defaultBehavior
        ) ||
        !build.behavior.matches(junctionBehavior, "select", defaultBehavior)
      ) {
        return memoLeft;
      }

      const memoRight = Object.entries(junctionTable.getRelations())
        .filter(([relName, rel]) => {
          if (rel.isReferencee) {
            return false;
          }
          if (
            rel.source === leftTable &&
            arraysAreEqual(rel.localColumns, junctionLeftRelation.remoteColumns)
          ) {
            return false;
          }
          const otherRelationBehavior = build.pgGetBehavior(rel.extensions);
          if (
            !build.behavior.matches(
              otherRelationBehavior,
              "manyToMany",
              defaultBehavior
            )
          ) {
            return false;
          }
          return true;
        })
        .reduce((memoRight, [rightRelationName, junctionRightRelation]) => {
          const rightTable = resolveSource(junctionRightRelation.source);

          const rightTableBehavior = build.pgGetBehavior(rightTable.extensions);
          if (
            !build.behavior.matches(
              rightTableBehavior,
              "manyToMany",
              defaultBehavior
            ) ||
            !build.behavior.matches(
              rightTableBehavior,
              "select",
              defaultBehavior
            )
          ) {
            return memoRight;
          }

          // Ensure junction constraint keys are not unique (which would result in a one-to-one relation)
          const junctionLeftConstraintIsUnique = !!junctionTable.uniques.find(
            (c) =>
              // TODO: order is unimportant
              arraysAreEqual(c.columns, junctionLeftRelation.remoteColumns)
          );
          const junctionRightConstraintIsUnique = !!junctionTable.uniques.find(
            (c) => arraysAreEqual(c.columns, junctionRightRelation.localColumns)
          );
          if (
            junctionLeftConstraintIsUnique ||
            junctionRightConstraintIsUnique
          ) {
            return memoRight;
          }

          const relationColumns = [
            ...junctionLeftRelation.remoteColumns,
            ...junctionRightRelation.localColumns,
          ].sort();
          const allowsMultipleEdgesToNode = !junctionTable.uniques.find((c) =>
            arraysAreEqual(c.columns.concat().sort(), relationColumns)
          );

          memoRight.push({
            leftTable,
            leftRelationName,
            junctionTable,
            rightRelationName,
            rightTable,
            allowsMultipleEdgesToNode,
          });
          return memoRight;
        }, [] as PgManyToManyRelationDetails[]);
      return [...memoLeft, ...memoRight];
    },
    [] as PgManyToManyRelationDetails[]
  );
}
