import type {
  PgTableResource,
  PgManyToManyRelationDetails,
} from "./interfaces.js";

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
  leftTable: PgTableResource,
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

      const junctionTable: PgTableResource =
        junctionLeftRelation.remoteResource;

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
        .filter(([_relName, rel]) => {
          if (rel.isReferencee) {
            return false;
          }
          if (
            rel.remoteResource === leftTable &&
            arraysAreEqual(
              rel.localAttributes,
              junctionLeftRelation.remoteAttributes
            )
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
          const rightTable = junctionRightRelation.remoteResource;

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
              arraysAreEqual(
                c.attributes,
                junctionLeftRelation.remoteAttributes
              )
          );
          const junctionRightConstraintIsUnique = !!junctionTable.uniques.find(
            (c) =>
              arraysAreEqual(
                c.attributes,
                junctionRightRelation.localAttributes
              )
          );
          if (
            junctionLeftConstraintIsUnique ||
            junctionRightConstraintIsUnique
          ) {
            return memoRight;
          }

          const relationAttributes = [
            ...junctionLeftRelation.remoteAttributes,
            ...junctionRightRelation.localAttributes,
          ].sort();
          const allowsMultipleEdgesToNode = !junctionTable.uniques.find((c) =>
            arraysAreEqual(c.attributes.concat().sort(), relationAttributes)
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
