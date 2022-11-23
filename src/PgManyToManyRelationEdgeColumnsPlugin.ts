import { PgSelectSingleStep, PgTypeColumns } from "@dataplan/pg";
import { ExecutableStep } from "grafast";
import type {} from "graphile-config";
import { isOutputType } from "graphql";
import type {} from "postgraphile";

const version = require("../../package.json").version;

declare global {
  namespace GraphileBuild {
    interface ScopeObjectFieldsField {
      isPgManyToManyRelationEdgeColumnField?: boolean;
    }
  }
}

export const PgManyToManyRelationEdgeColumnsPlugin: GraphileConfig.Plugin = {
  name: "PgManyToManyRelationEdgeColumnsPlugin",
  version,

  schema: {
    hooks: {
      GraphQLObjectType_fields(fields, build, context) {
        const {
          extend,
          sql,
          graphql: { GraphQLString, GraphQLNonNull },
          inflection,
          nullableIf,
        } = build;
        const {
          scope: { isPgManyToManyEdgeType, pgManyToManyRelationship },
          fieldWithHooks,
        } = context;

        if (!isPgManyToManyEdgeType || !pgManyToManyRelationship) {
          return fields;
        }

        const {
          leftKeyAttributes,
          junctionTable,
          junctionLeftKeyAttributes,
          junctionRightKeyAttributes,
          rightKeyAttributes,
          allowsMultipleEdgesToNode,
        } = pgManyToManyRelationship;

        if (allowsMultipleEdgesToNode) {
          return fields;
        }

        return extend(
          fields,
          Object.entries(junctionTable.columns as PgTypeColumns).reduce(
            (memo, [columnName, column]) => {
              const behavior = build.pgGetBehavior(column.extensions);
              if (!build.behavior.matches(behavior, "select", "select")) {
                return memo;
              }

              // Skip left and right key attributes
              if (
                junctionLeftKeyAttributes
                  .map((a) => a.columnName)
                  .includes(columnName)
              )
                return memo;
              if (
                junctionRightKeyAttributes
                  .map((a) => a.columnName)
                  .includes(columnName)
              )
                return memo;

              const fieldName = inflection.column({
                column,
                columnName,
                codec: column.codec,
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
                    () => {
                      /*
                      // Since we're ignoring multi-column keys, we can simplify here
                      const leftKeyAttribute = leftKeyAttributes[0];
                      const junctionLeftKeyAttribute =
                        junctionLeftKeyAttributes[0];
                      const junctionRightKeyAttribute =
                        junctionRightKeyAttributes[0];
                      const rightKeyAttribute = rightKeyAttributes[0];

                      const sqlSelectFrom = sql.fragment`select ${sql.identifier(
                        columName
                      )} from ${sql.identifier(
                        junctionTable.namespace.name,
                        junctionTable.name
                      )}`;

                      addDataGenerator((parsedResolveInfoFragment) => {
                        return {
                          pgQuery: (queryBuilder) => {
                            queryBuilder.select(
                              getSelectValueForFieldAndTypeAndModifier(
                                ReturnType,
                                fieldContext,
                                parsedResolveInfoFragment,
                                sql.fragment`(${sqlSelectFrom} where ${sql.identifier(
                                  junctionRightKeyAttribute.name
                                )} = ${queryBuilder.getTableAlias()}.${sql.identifier(
                                  rightKeyAttribute.name
                                )} and ${sql.identifier(
                                  junctionLeftKeyAttribute.name
                                )} = ${queryBuilder.parentQueryBuilder.parentQueryBuilder.getTableAlias()}.${sql.identifier(
                                  leftKeyAttribute.name
                                )})`,
                                type,
                                typeModifier
                              ),
                              fieldName
                            );
                          },
                        };
                      });
                      */
                      return {
                        description: column.description,
                        type: nullableIf(
                          !column.notNull &&
                            !column.codec.notNull &&
                            !column.extensions?.tags?.notNull,
                          ReturnType
                        ),
                        plan($edge: PgSelectSingleStep<any, any, any, any>) {
                          return $edge.get(columnName);
                        },
                      };
                    }
                  ),
                },
                `PgManyToMany adding edge field for '${columnName}'.`
              );
              return memo;
            },
            {}
          ),
          `Adding columns to '${junctionTable.name}'`
        );
      },
    },
  },
};
