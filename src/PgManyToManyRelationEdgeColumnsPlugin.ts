import { PgSelectSingleStep } from "@dataplan/pg";
import { EdgeStep } from "grafast";
import type {} from "graphile-config";
import { isOutputType } from "graphql";
import type {} from "postgraphile";
import { junctionSymbol } from "./PgManyToManyRelationPlugin";

const version = require("../package.json").version;

export const PgManyToManyRelationEdgeColumnsPlugin: GraphileConfig.Plugin = {
  name: "PgManyToManyRelationEdgeColumnsPlugin",
  description: `\
When a many-to-many relationship is unique (i.e. there can be at most one
record in the junction table for each record in the left and right tables),
this plugin adds a field to the edges for each non-key attribute on the
junction table.`,
  version,

  schema: {
    hooks: {
      GraphQLObjectType_fields(fields, build, context) {
        const { extend, sql, inflection, nullableIf } = build;
        const {
          scope: { isPgManyToManyEdgeType, pgManyToManyRelationship },
          fieldWithHooks,
          Self,
        } = context;

        if (!isPgManyToManyEdgeType || !pgManyToManyRelationship) {
          return fields;
        }

        const {
          leftTable,
          leftRelationName,
          junctionTable,
          rightRelationName,
          allowsMultipleEdgesToNode,
        } = pgManyToManyRelationship;

        const junctionLeftKeyAttributeNames =
          leftTable.getRelation(leftRelationName).remoteColumns;
        const junctionRightKeyAttributeNames =
          junctionTable.getRelation(rightRelationName).localColumns;

        if (allowsMultipleEdgesToNode) {
          return fields;
        }

        return extend(
          fields,
          Object.entries(junctionTable.codec.columns).reduce(
            (memo, [columnName, column]) =>
              build.recoverable(memo, () => {
                const behavior = build.pgGetBehavior(column.extensions);
                if (!build.behavior.matches(behavior, "select", "select")) {
                  return memo;
                }

                // Skip left and right key attributes
                if (junctionLeftKeyAttributeNames.includes(columnName)) {
                  return memo;
                }
                if (junctionRightKeyAttributeNames.includes(columnName)) {
                  return memo;
                }

                const codec = column.codec;
                const fieldName = inflection.column({
                  codec: junctionTable.codec,
                  columnName,
                });
                const ReturnType = build.getGraphQLTypeByPgCodec(
                  column.codec,
                  "output"
                );
                if (!ReturnType || !isOutputType(ReturnType)) {
                  return memo;
                }

                memo = extend(
                  memo,
                  {
                    [fieldName]: fieldWithHooks(
                      {
                        fieldName,
                        isPgManyToManyRelationEdgeColumnField: true,
                        pgFieldCodec: column.codec,
                      },
                      () => ({
                        description: column.description,
                        type: nullableIf(
                          !column.notNull &&
                            !column.codec.notNull &&
                            !column.extensions?.tags?.notNull,
                          ReturnType
                        ),
                        plan(
                          $edge: EdgeStep<
                            any,
                            any,
                            any,
                            PgSelectSingleStep<any, any, any, any>
                          >
                        ) {
                          const $right = $edge.node();
                          return $right.select(
                            sql`${sql.identifier(
                              junctionSymbol
                            )}.${sql.identifier(columnName)}`,
                            codec
                          );
                        },
                      })
                    ),
                  },
                  `PgManyToMany adding edge field for '${junctionTable.name}.${columnName}' to ${Self.name}.`
                );
                return memo;
              }),
            Object.create(null)
          ),
          `Adding columns to '${junctionTable.name}'`
        );
      },
    },
  },
};
