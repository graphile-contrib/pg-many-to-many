import type { PgSelectSingleStep } from "@dataplan/pg";
import type { EdgeStep } from "grafast";
import type {} from "graphile-config";
import type {} from "postgraphile";
import { junctionSymbol } from "./PgManyToManyRelationPlugin";

const version = require("../package.json").version;

export const PgManyToManyRelationEdgeAttributesPlugin: GraphileConfig.Plugin = {
  name: "PgManyToManyRelationEdgeAttributesPlugin",
  description: `\
When a many-to-many relationship is unique (i.e. there can be at most one
record in the junction table for each record in the left and right tables),
this plugin adds a field to the edges for each non-key attribute on the
junction table.`,
  version,

  schema: {
    hooks: {
      GraphQLObjectType_fields(fields, build, context) {
        const {
          extend,
          sql,
          inflection,
          nullableIf,
          graphql: { isOutputType },
        } = build;
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
          leftTable.getRelation(leftRelationName).remoteAttributes;
        const junctionRightKeyAttributeNames =
          junctionTable.getRelation(rightRelationName).localAttributes;

        if (allowsMultipleEdgesToNode) {
          return fields;
        }

        return extend(
          fields,
          Object.entries(junctionTable.codec.attributes).reduce(
            (memo, [attributeName, attribute]) =>
              build.recoverable(memo, () => {
                if (
                  !build.behavior.pgCodecAttributeMatches(
                    [junctionTable.codec, attribute],
                    "select"
                  )
                ) {
                  return memo;
                }

                // Skip left and right key attributes
                if (junctionLeftKeyAttributeNames.includes(attributeName)) {
                  return memo;
                }
                if (junctionRightKeyAttributeNames.includes(attributeName)) {
                  return memo;
                }

                const codec = attribute.codec;
                const fieldName = inflection.attribute({
                  codec: junctionTable.codec,
                  attributeName,
                });
                const ReturnType = build.getGraphQLTypeByPgCodec(
                  attribute.codec,
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
                        isPgManyToManyRelationEdgeAttributeField: true,
                        pgFieldCodec: attribute.codec,
                      },
                      () => ({
                        description: attribute.description,
                        type: nullableIf(
                          !attribute.notNull &&
                            !attribute.codec.notNull &&
                            !attribute.extensions?.tags?.notNull,
                          ReturnType
                        ),
                        plan(
                          $edge: EdgeStep<any, any, any, PgSelectSingleStep>
                        ) {
                          const $right = $edge.node();
                          return $right.select(
                            sql`${sql.identifier(
                              junctionSymbol
                            )}.${sql.identifier(attributeName)}`,
                            codec
                          );
                        },
                      })
                    ),
                  },
                  `PgManyToMany adding edge field for '${junctionTable.name}.${attributeName}' to ${Self.name}.`
                );
                return memo;
              }),
            Object.create(null)
          ),
          `Adding attributes to '${junctionTable.name}'`
        );
      },
    },
  },
};
