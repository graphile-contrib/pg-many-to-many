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
            (memo, [columnName, column]) => {
              const behavior = build.pgGetBehavior(column.extensions);
              if (!build.behavior.matches(behavior, "select", "select")) {
                return memo;
              }

              // Skip left and right key attributes
              if (junctionLeftKeyAttributeNames.includes(columnName))
                return memo;
              if (junctionRightKeyAttributeNames.includes(columnName))
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
                    () => ({
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
                    })
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
