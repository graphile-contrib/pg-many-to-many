module.exports = function PgManyToManyEdgeTablePlugin(
  builder,
  { pgSimpleCollections }
) {
  builder.hook("GraphQLObjectType:fields", (fields, build, context) => {
    const {
      extend,
      getTypeByName,
      pgGetGqlTypeByTypeIdAndModifier,
      graphql: { GraphQLNonNull, GraphQLList },
      inflection,
      getSafeAliasFromResolveInfo,
      getSafeAliasFromAlias,
      pgQueryFromResolveData: queryFromResolveData,
      pgAddStartEndCursor: addStartEndCursor,
      pgSql: sql,
      describePgEntity,
    } = build;
    const {
      scope: { isPgRowEdgeType, pgManyToManyRelationship },
      fieldWithHooks,
      Self,
    } = context;
    if (!isPgRowEdgeType || !pgManyToManyRelationship) {
      return fields;
    }

    const {
      leftKeyAttributes,
      junctionLeftKeyAttributes,
      rightTable,
      rightKeyAttributes,
      junctionRightKeyAttributes,
      junctionTable,
      junctionRightConstraint,
      allowsMultipleEdgesToNode,
    } = pgManyToManyRelationship;

    if (!allowsMultipleEdgesToNode) {
      return fields;
    }

    const JunctionTableType = pgGetGqlTypeByTypeIdAndModifier(
      junctionTable.type.id,
      null
    );
    if (!JunctionTableType) {
      throw new Error(
        `Could not determine type for table with id ${junctionTable.type.id}`
      );
    }
    const JunctionTableConnectionType = getTypeByName(
      inflection.connection(JunctionTableType.name)
    );

    function makeFields(isConnection) {
      const manyRelationFieldName = isConnection
        ? inflection.manyRelationByKeys(
            junctionRightKeyAttributes,
            junctionTable,
            rightTable,
            junctionRightConstraint
          )
        : inflection.manyRelationByKeysSimple(
            junctionRightKeyAttributes,
            junctionTable,
            rightTable,
            junctionRightConstraint
          );

      fields = extend(
        fields,
        {
          [manyRelationFieldName]: fieldWithHooks(
            manyRelationFieldName,
            ({ getDataFromParsedResolveInfoFragment, addDataGenerator }) => {
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
              addDataGenerator(parsedResolveInfoFragment => {
                return {
                  pgQuery: queryBuilder => {
                    queryBuilder.select(() => {
                      const resolveData = getDataFromParsedResolveInfoFragment(
                        parsedResolveInfoFragment,
                        isConnection
                          ? JunctionTableConnectionType
                          : JunctionTableType
                      );
                      const junctionTableAlias = sql.identifier(Symbol());
                      const rightTableAlias = queryBuilder.getTableAlias();
                      const leftTableAlias = queryBuilder.parentQueryBuilder.parentQueryBuilder.getTableAlias();
                      const query = queryFromResolveData(
                        sqlFrom,
                        junctionTableAlias,
                        resolveData,
                        queryOptions,
                        innerQueryBuilder => {
                          innerQueryBuilder.parentQueryBuilder = queryBuilder;
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
                                junctionPrimaryKeyAttributes.forEach(attr => {
                                  innerQueryBuilder.orderBy(
                                    sql.fragment`${innerQueryBuilder.getTableAlias()}.${sql.identifier(
                                      attr.name
                                    )}`,
                                    true
                                  );
                                });
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

              const junctionTableTypeName = inflection.tableType(junctionTable);
              return {
                description: `Reads and enables pagination through a set of \`${junctionTableTypeName}\`.`,
                type: isConnection
                  ? new GraphQLNonNull(JunctionTableConnectionType)
                  : new GraphQLNonNull(
                      new GraphQLList(new GraphQLNonNull(JunctionTableType))
                    ),
                args: {},
                resolve: (data, _args, _context, resolveInfo) => {
                  const safeAlias = getSafeAliasFromResolveInfo(resolveInfo);
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
          junctionRightConstraint
        )}.`
      );
    }
    const simpleCollections =
      junctionRightConstraint.tags.simpleCollections ||
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
  });
};