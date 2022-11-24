import type {} from "graphile-config";
import type {} from "postgraphile";

const version = require("../../package.json").version;

export const PgManyToManyRelationEdgeTablePlugin: GraphileConfig.Plugin = {
  name: "PgManyToManyRelationEdgeTablePlugin",
  description: `\
When a many-to-many relationship can be satisfied over multiple records (i.e.
the join is not unique), this plugin adds a field to the edges where all of the
join records can be traversed.`,
  version,

  schema: {
    hooks: {
      GraphQLObjectType_fields(fields, build, context) {
        const {
          extend,
          getTypeByName,
          graphql: { GraphQLNonNull, GraphQLList },
          inflection,
        } = build;
        const {
          scope: { isPgManyToManyEdgeType, pgManyToManyRelationship },
          fieldWithHooks,
          Self,
        } = context;
        if (!isPgManyToManyEdgeType || !pgManyToManyRelationship) {
          return fields;
        }

        const { rightTable, junctionTable, allowsMultipleEdgesToNode } =
          pgManyToManyRelationship;

        if (!allowsMultipleEdgesToNode) {
          return fields;
        }

        const JunctionTableType = build.getGraphQLTypeByPgCodec(
          junctionTable.codec,
          "output"
        );
        if (!JunctionTableType) {
          throw new Error(
            `Could not determine output type for ${junctionTable.name}`
          );
        }
        const JunctionTableConnectionType = getTypeByName(
          inflection.tableConnectionType(junctionTable.codec)
        );

        function makeFields(isConnection: boolean) {
          const fieldName = isConnection
            ? inflection.manyRelationConnection({
                source: junctionTable,
                codec: sourceCodec,
                identifier: sourceRelationName,
                relation: junctionRightRelation,
              })
            : inflection.manyRelationList(
                junctionRightKeyAttributes,
                junctionTable,
                rightTable,
                junctionRightRelation
              );
          const Type = isConnection
            ? JunctionTableConnectionType
            : JunctionTableType;
          if (!Type) {
            return;
          }

          fields = extend(
            fields,
            {
              [fieldName]: fieldWithHooks(
                fieldName,
                ({
                  getDataFromParsedResolveInfoFragment,
                  addDataGenerator,
                }) => {
                  const sqlFrom = sql.identifier(
                    junctionTable.namespace.name,
                    junctionTable.name
                  );
                  const queryOptions = {
                    useAsterisk: junctionTable.canUseAsterisk,
                    withPagination: isConnection,
                    withPaginationAsFields: false,
                    asJsonAggregate: !isConnection,
                  };
                  addDataGenerator((parsedResolveInfoFragment) => {
                    return {
                      pgQuery: (queryBuilder) => {
                        queryBuilder.select(() => {
                          const resolveData =
                            getDataFromParsedResolveInfoFragment(
                              parsedResolveInfoFragment,
                              Type
                            );
                          const junctionTableAlias = sql.identifier(Symbol());
                          const rightTableAlias = queryBuilder.getTableAlias();
                          const leftTableAlias =
                            queryBuilder.parentQueryBuilder.parentQueryBuilder.getTableAlias();
                          const query = queryFromResolveData(
                            sqlFrom,
                            junctionTableAlias,
                            resolveData,
                            queryOptions,
                            (innerQueryBuilder) => {
                              innerQueryBuilder.parentQueryBuilder =
                                queryBuilder;
                              const junctionPrimaryKeyConstraint =
                                junctionTable.primaryKeyConstraint;
                              const junctionPrimaryKeyAttributes =
                                junctionPrimaryKeyConstraint &&
                                junctionPrimaryKeyConstraint.keyAttributes;
                              if (junctionPrimaryKeyAttributes) {
                                innerQueryBuilder.beforeLock("orderBy", () => {
                                  // append order by primary key to the list of orders
                                  if (!innerQueryBuilder.isOrderUnique(false)) {
                                    innerQueryBuilder.data.cursorPrefix = [
                                      "primary_key_asc",
                                    ];
                                    junctionPrimaryKeyAttributes.forEach(
                                      (attr) => {
                                        innerQueryBuilder.orderBy(
                                          sql.fragment`${innerQueryBuilder.getTableAlias()}.${sql.identifier(
                                            attr.name
                                          )}`,
                                          true
                                        );
                                      }
                                    );
                                    innerQueryBuilder.setOrderIsUnique();
                                  }
                                });
                              }

                              junctionRightKeyAttributes.forEach((attr, i) => {
                                innerQueryBuilder.where(
                                  sql.fragment`${junctionTableAlias}.${sql.identifier(
                                    attr.name
                                  )} = ${rightTableAlias}.${sql.identifier(
                                    rightKeyAttributes[i].name
                                  )}`
                                );
                              });

                              junctionLeftKeyAttributes.forEach((attr, i) => {
                                innerQueryBuilder.where(
                                  sql.fragment`${junctionTableAlias}.${sql.identifier(
                                    attr.name
                                  )} = ${leftTableAlias}.${sql.identifier(
                                    leftKeyAttributes[i].name
                                  )}`
                                );
                              });
                            },
                            queryBuilder.context,
                            queryBuilder.rootValue
                          );
                          return sql.fragment`(${query})`;
                        }, getSafeAliasFromAlias(parsedResolveInfoFragment.alias));
                      },
                    };
                  });

                  return {
                    description: `Reads and enables pagination through a set of \`${JunctionTableType.name}\`.`,
                    type: isConnection
                      ? new GraphQLNonNull(JunctionTableConnectionType)
                      : new GraphQLNonNull(
                          new GraphQLList(new GraphQLNonNull(JunctionTableType))
                        ),
                    args: {},
                    resolve: (data, _args, _context, resolveInfo) => {
                      const safeAlias =
                        getSafeAliasFromResolveInfo(resolveInfo);
                      if (isConnection) {
                        return addStartEndCursor(data[safeAlias]);
                      } else {
                        return data[safeAlias];
                      }
                    },
                  };
                },
                {
                  isPgFieldConnection: isConnection,
                  isPgFieldSimpleCollection: !isConnection,
                  isPgManyToManyRelationEdgeTableField: true,
                  pgFieldIntrospection: junctionTable,
                }
              ),
            },

            `Many-to-many relation edge table (${
              isConnection ? "connection" : "simple collection"
            }) on ${Self.name} type for ${describePgEntity(
              junctionRightRelation
            )}.`
          );
        }
        const simpleCollections =
          junctionRightRelation.tags.simpleCollections ||
          junctionTable.tags.simpleCollections ||
          pgSimpleCollections;
        const hasConnections = simpleCollections !== "only";
        const hasSimpleCollections =
          simpleCollections === "only" || simpleCollections === "both";
        if (hasConnections) {
          makeFields(true);
        }
        if (hasSimpleCollections) {
          makeFields(false);
        }
        return fields;
      },
    },
  },
};
