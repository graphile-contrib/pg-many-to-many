function arraysAreEqual(array1, array2) {
  return (
    array1.length === array2.length && array1.every((el, i) => array2[i] === el)
  );
}

// Given a `leftTable`, trace through the foreign key relations
// and identify a `junctionTable` and `rightTable`.
// Returns a list of data objects for these many-to-many relationships.
function manyToManyRelationships(leftTable, build) {
  const {
    pgIntrospectionResultsByKind: introspectionResultsByKind,
    pgOmit: omit,
  } = build;

  return leftTable.foreignConstraints
    .filter(con => con.type === "f")
    .reduce((memoLeft, junctionLeftConstraint) => {
      if (
        omit(junctionLeftConstraint, "read") ||
        omit(junctionLeftConstraint, "manyToMany")
      ) {
        return memoLeft;
      }
      const junctionTable =
        introspectionResultsByKind.classById[junctionLeftConstraint.classId];
      if (!junctionTable) {
        throw new Error(
          `Could not find the table that referenced us (constraint: ${junctionLeftConstraint.name})`
        );
      }
      if (omit(junctionTable, "manyToMany")) {
        return memoLeft;
      }
      const memoRight = junctionTable.constraints
        .filter(
          con =>
            con.id !== junctionLeftConstraint.id && // Don't follow the same constraint back to the left table
            con.type === "f" &&
            !omit(con, "read") &&
            !omit(con, "manyToMany")
        )
        .reduce((memoRight, junctionRightConstraint) => {
          const rightTable = junctionRightConstraint.foreignClass;

          const leftKeyAttributes = junctionLeftConstraint.foreignKeyAttributes;
          const junctionLeftKeyAttributes =
            junctionLeftConstraint.keyAttributes;
          const junctionRightKeyAttributes =
            junctionRightConstraint.keyAttributes;
          const rightKeyAttributes =
            junctionRightConstraint.foreignKeyAttributes;

          // Ensure keys were found
          if (
            !leftKeyAttributes.every(_ => _) ||
            !junctionLeftKeyAttributes.every(_ => _) ||
            !junctionRightKeyAttributes.every(_ => _) ||
            !rightKeyAttributes.every(_ => _)
          ) {
            throw new Error("Could not find key columns!");
          }

          // Ensure keys can be read
          if (
            leftKeyAttributes.some(attr => omit(attr, "read")) ||
            junctionLeftKeyAttributes.some(attr => omit(attr, "read")) ||
            junctionRightKeyAttributes.some(attr => omit(attr, "read")) ||
            rightKeyAttributes.some(attr => omit(attr, "read"))
          ) {
            return memoRight;
          }

          // Ensure both constraints are single-column
          // TODO: handle multi-column
          if (leftKeyAttributes.length > 1 || rightKeyAttributes.length > 1) {
            return memoRight;
          }

          // Ensure junction constraint keys are not unique (which would result in a one-to-one relation)
          const junctionLeftConstraintIsUnique = !!junctionTable.constraints.find(
            c =>
              ["p", "u"].includes(c.type) &&
              arraysAreEqual(
                c.keyAttributeNums,
                junctionLeftKeyAttributes.map(attr => attr.num)
              )
          );
          const junctionRightConstraintIsUnique = !!junctionTable.constraints.find(
            c =>
              ["p", "u"].includes(c.type) &&
              arraysAreEqual(
                c.keyAttributeNums,
                junctionRightKeyAttributes.map(attr => attr.num)
              )
          );
          if (
            junctionLeftConstraintIsUnique ||
            junctionRightConstraintIsUnique
          ) {
            return memoRight;
          }

          const allowsMultipleEdgesToNode = !junctionTable.constraints.find(
            c =>
              ["p", "u"].includes(c.type) &&
              arraysAreEqual(
                c.keyAttributeNums.concat().sort(),
                [
                  ...junctionLeftKeyAttributes.map(obj => obj.num),
                  ...junctionRightKeyAttributes.map(obj => obj.num),
                ].sort()
              )
          );

          return [
            ...memoRight,
            {
              leftKeyAttributes,
              junctionLeftKeyAttributes,
              junctionRightKeyAttributes,
              rightKeyAttributes,
              junctionTable,
              rightTable,
              junctionLeftConstraint,
              junctionRightConstraint,
              allowsMultipleEdgesToNode,
            },
          ];
        }, []);
      return [...memoLeft, ...memoRight];
    }, []);
}
const hasNonNullKey = row => {
  if (
    Array.isArray(row.__identifiers) &&
    row.__identifiers.every(i => i != null)
  ) {
    return true;
  }
  for (const k in row) {
    if (Object.prototype.hasOwnProperty.call(row, k)) {
      if ((k[0] !== "_" || k[1] !== "_") && row[k] !== null) {
        return true;
      }
    }
  }
  return false;
};

function createManyToManyConnectionType(
  relationship,
  build,
  options,
  leftTable
) {
  const {
    leftKeyAttributes,
    junctionLeftKeyAttributes,
    junctionRightKeyAttributes,
    rightKeyAttributes,
    junctionTable,
    rightTable,
    junctionLeftConstraint,
    junctionRightConstraint,
  } = relationship;
  const {
    newWithHooks,
    inflection,
    graphql: { GraphQLObjectType, GraphQLNonNull, GraphQLList },
    getTypeByName,
    pgGetGqlTypeByTypeIdAndModifier,
    pgField,
    getSafeAliasFromResolveInfo,
  } = build;
  const { pgForbidSetofFunctionsToReturnNull = false } = options;
  const nullableIf = (condition, Type) =>
    condition ? Type : new GraphQLNonNull(Type);
  const Cursor = getTypeByName("Cursor");
  const handleNullRow = pgForbidSetofFunctionsToReturnNull
    ? row => row
    : (row, identifiers) => {
        if ((identifiers && hasNonNullKey(identifiers)) || hasNonNullKey(row)) {
          return row;
        } else {
          return null;
        }
      };

  const LeftTableType = pgGetGqlTypeByTypeIdAndModifier(
    leftTable.type.id,
    null
  );
  if (!LeftTableType) {
    throw new Error(
      `Could not determine type for table with id ${leftTable.type.id}`
    );
  }

  const TableType = pgGetGqlTypeByTypeIdAndModifier(rightTable.type.id, null);
  if (!TableType) {
    throw new Error(
      `Could not determine type for table with id ${rightTable.type.id}`
    );
  }

  const rightPrimaryKeyConstraint = rightTable.primaryKeyConstraint;
  const rightPrimaryKeyAttributes =
    rightPrimaryKeyConstraint && rightPrimaryKeyConstraint.keyAttributes;

  const junctionTypeName = inflection.tableType(junctionTable);
  const base64 = str => Buffer.from(String(str)).toString("base64");

  const EdgeType = newWithHooks(
    GraphQLObjectType,
    {
      description: `A \`${TableType.name}\` edge in the connection, with data from \`${junctionTypeName}\`.`,
      name: inflection.manyToManyRelationEdge(
        leftKeyAttributes,
        junctionLeftKeyAttributes,
        junctionRightKeyAttributes,
        rightKeyAttributes,
        junctionTable,
        rightTable,
        junctionLeftConstraint,
        junctionRightConstraint,
        LeftTableType.name
      ),
      fields: ({ fieldWithHooks }) => {
        return {
          cursor: fieldWithHooks(
            "cursor",
            ({ addDataGenerator }) => {
              addDataGenerator(() => ({
                usesCursor: [true],
                pgQuery: queryBuilder => {
                  if (rightPrimaryKeyAttributes) {
                    queryBuilder.selectIdentifiers(rightTable);
                  }
                },
              }));
              return {
                description: "A cursor for use in pagination.",
                type: Cursor,
                resolve(data) {
                  return data.__cursor && base64(JSON.stringify(data.__cursor));
                },
              };
            },
            {
              isCursorField: true,
            }
          ),
          node: pgField(
            build,
            fieldWithHooks,
            "node",
            {
              description: `The \`${TableType.name}\` at the end of the edge.`,
              type: nullableIf(!pgForbidSetofFunctionsToReturnNull, TableType),
              resolve(data, _args, _context, resolveInfo) {
                const safeAlias = getSafeAliasFromResolveInfo(resolveInfo);
                const record = handleNullRow(
                  data[safeAlias],
                  data.__identifiers
                );
                return record;
              },
            },
            {},
            false,
            {}
          ),
        };
      },
    },
    {
      isEdgeType: true,
      isPgRowEdgeType: true,
      isPgManyToManyEdgeType: true,
      nodeType: TableType,
      pgManyToManyRelationship: relationship,
    }
  );
  const PageInfo = getTypeByName(inflection.builtin("PageInfo"));

  return newWithHooks(
    GraphQLObjectType,
    {
      description: `A connection to a list of \`${TableType.name}\` values, with data from \`${junctionTypeName}\`.`,
      name: inflection.manyToManyRelationConnection(
        leftKeyAttributes,
        junctionLeftKeyAttributes,
        junctionRightKeyAttributes,
        rightKeyAttributes,
        junctionTable,
        rightTable,
        junctionLeftConstraint,
        junctionRightConstraint,
        LeftTableType.name
      ),
      fields: ({ recurseDataGeneratorsForField, fieldWithHooks }) => {
        recurseDataGeneratorsForField("pageInfo", true);
        return {
          nodes: pgField(
            build,
            fieldWithHooks,
            "nodes",
            {
              description: `A list of \`${TableType.name}\` objects.`,
              type: new GraphQLNonNull(
                new GraphQLList(
                  nullableIf(!pgForbidSetofFunctionsToReturnNull, TableType)
                )
              ),
              resolve(data, _args, _context, resolveInfo) {
                const safeAlias = getSafeAliasFromResolveInfo(resolveInfo);
                return data.data.map(entry => {
                  const record = handleNullRow(
                    entry[safeAlias],
                    entry[safeAlias].__identifiers
                  );
                  return record;
                });
              },
            },
            {},
            false,
            {}
          ),
          edges: pgField(
            build,
            fieldWithHooks,
            "edges",
            {
              description: `A list of edges which contains the \`${TableType.name}\`, info from the \`${junctionTypeName}\`, and the cursor to aid in pagination.`,
              type: new GraphQLNonNull(
                new GraphQLList(new GraphQLNonNull(EdgeType))
              ),
              resolve(data, _args, _context, resolveInfo) {
                const safeAlias = getSafeAliasFromResolveInfo(resolveInfo);
                return data.data.map(entry => ({
                  ...entry,
                  ...entry[safeAlias],
                }));
              },
            },
            {},
            false,
            {
              hoistCursor: true,
            }
          ),
          pageInfo: PageInfo && {
            description: "Information to aid in pagination.",
            type: new GraphQLNonNull(PageInfo),
            resolve(data) {
              return data;
            },
          },
        };
      },
    },
    {
      isConnectionType: true,
      isPgRowConnectionType: true,
      edgeType: EdgeType,
      nodeType: TableType,
      pgIntrospection: rightTable,
    }
  );
}

module.exports = function PgManyToManyRelationPlugin(builder, options) {
  const { pgSimpleCollections } = options;
  builder.hook("GraphQLObjectType:fields", (fields, build, context) => {
    const {
      extend,
      pgGetGqlTypeByTypeIdAndModifier,
      pgSql: sql,
      getSafeAliasFromResolveInfo,
      getSafeAliasFromAlias,
      graphql: { GraphQLNonNull, GraphQLList },
      inflection,
      pgQueryFromResolveData: queryFromResolveData,
      pgAddStartEndCursor: addStartEndCursor,
      describePgEntity,
    } = build;
    const {
      scope: { isPgRowType, pgIntrospection: leftTable },
      fieldWithHooks,
      Self,
    } = context;
    if (!isPgRowType || !leftTable || leftTable.kind !== "class") {
      return fields;
    }

    const relationships = manyToManyRelationships(leftTable, build);
    return extend(
      fields,
      relationships.reduce((memo, relationship) => {
        const {
          leftKeyAttributes,
          junctionLeftKeyAttributes,
          junctionRightKeyAttributes,
          rightKeyAttributes,
          junctionTable,
          rightTable,
          junctionLeftConstraint,
          junctionRightConstraint,
        } = relationship;
        const RightTableType = pgGetGqlTypeByTypeIdAndModifier(
          rightTable.type.id,
          null
        );
        if (!RightTableType) {
          throw new Error(
            `Could not determine type for table with id ${rightTable.type.id}`
          );
        }
        const RightTableConnectionType = createManyToManyConnectionType(
          relationship,
          build,
          options,
          leftTable
        );

        // Since we're ignoring multi-column keys, we can simplify here
        const leftKeyAttribute = leftKeyAttributes[0];
        const junctionLeftKeyAttribute = junctionLeftKeyAttributes[0];
        const junctionRightKeyAttribute = junctionRightKeyAttributes[0];
        const rightKeyAttribute = rightKeyAttributes[0];

        function makeFields(isConnection) {
          const manyRelationFieldName = isConnection
            ? inflection.manyToManyRelationByKeys(
                leftKeyAttributes,
                junctionLeftKeyAttributes,
                junctionRightKeyAttributes,
                rightKeyAttributes,
                junctionTable,
                rightTable,
                junctionLeftConstraint,
                junctionRightConstraint
              )
            : inflection.manyToManyRelationByKeysSimple(
                leftKeyAttributes,
                junctionLeftKeyAttributes,
                junctionRightKeyAttributes,
                rightKeyAttributes,
                junctionTable,
                rightTable,
                junctionLeftConstraint,
                junctionRightConstraint
              );

          memo = extend(
            memo,
            {
              [manyRelationFieldName]: fieldWithHooks(
                manyRelationFieldName,
                ({
                  getDataFromParsedResolveInfoFragment,
                  addDataGenerator,
                }) => {
                  const sqlFrom = sql.identifier(
                    rightTable.namespace.name,
                    rightTable.name
                  );
                  const queryOptions = {
                    useAsterisk: rightTable.canUseAsterisk,
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
                              ? RightTableConnectionType
                              : RightTableType
                          );
                          const rightTableAlias = sql.identifier(Symbol());
                          const leftTableAlias = queryBuilder.getTableAlias();
                          const query = queryFromResolveData(
                            sqlFrom,
                            rightTableAlias,
                            resolveData,
                            queryOptions,
                            innerQueryBuilder => {
                              innerQueryBuilder.parentQueryBuilder = queryBuilder;
                              const rightPrimaryKeyConstraint =
                                rightTable.primaryKeyConstraint;
                              const rightPrimaryKeyAttributes =
                                rightPrimaryKeyConstraint &&
                                rightPrimaryKeyConstraint.keyAttributes;
                              if (rightPrimaryKeyAttributes) {
                                innerQueryBuilder.beforeLock("orderBy", () => {
                                  // append order by primary key to the list of orders
                                  if (!innerQueryBuilder.isOrderUnique(false)) {
                                    innerQueryBuilder.data.cursorPrefix = [
                                      "primary_key_asc",
                                    ];
                                    rightPrimaryKeyAttributes.forEach(attr => {
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

                              innerQueryBuilder.where(
                                sql.fragment`${rightTableAlias}.${sql.identifier(
                                  rightKeyAttribute.name
                                )} in (select ${sql.identifier(
                                  junctionRightKeyAttribute.name
                                )} from ${sql.identifier(
                                  junctionTable.namespace.name,
                                  junctionTable.name
                                )} where ${sql.identifier(
                                  junctionLeftKeyAttribute.name
                                )} = ${leftTableAlias}.${sql.identifier(
                                  leftKeyAttribute.name
                                )})`
                              );
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
                    description: `Reads and enables pagination through a set of \`${RightTableType.name}\`.`,
                    type: isConnection
                      ? new GraphQLNonNull(RightTableConnectionType)
                      : new GraphQLNonNull(
                          new GraphQLList(new GraphQLNonNull(RightTableType))
                        ),
                    args: {},
                    resolve: (data, _args, _context, resolveInfo) => {
                      const safeAlias = getSafeAliasFromResolveInfo(
                        resolveInfo
                      );
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
                  isPgManyToManyRelationField: true,
                  pgFieldIntrospection: rightTable,
                }
              ),
            },

            `Many-to-many relation field (${
              isConnection ? "connection" : "simple collection"
            }) on ${Self.name} type for ${describePgEntity(
              junctionLeftConstraint
            )} and ${describePgEntity(junctionRightConstraint)}.`
          );
        }

        const simpleCollections =
          junctionRightConstraint.tags.simpleCollections ||
          rightTable.tags.simpleCollections ||
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
        return memo;
      }, {}),
      `Adding many-to-many relations for ${Self.name}`
    );
  });
};
