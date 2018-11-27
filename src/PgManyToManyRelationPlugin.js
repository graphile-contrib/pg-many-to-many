const pgConnectionType = require("./pgConnectionType");
const pgEdgeType = require("./pgEdgeType");

const debugFactory = require("debug");
const debug = debugFactory("graphile-build-pg");

const hasNonNullKey = row => {
  if (
    Array.isArray(row.__identifiers) &&
    row.__identifiers.every(i => i != null)
  ) {
    return true;
  }
  for (const k in row) {
    if (row.hasOwnProperty(k)) {
      if ((k[0] !== "_" || k[1] !== "_") && row[k] !== null) {
        return true;
      }
    }
  }
  return false;
};

module.exports = function PgManyToManyRelationPlugin(
  builder,
  { pgSimpleCollections, pgForbidSetofFunctionsToReturnNull }
) {
  const handleNullRow = pgForbidSetofFunctionsToReturnNull
    ? row => row
    : row => {
        if (hasNonNullKey(row)) {
          return row;
        } else {
          return null;
        }
      };

  const hasConnections = pgSimpleCollections !== "only";
  const hasSimpleCollections =
    pgSimpleCollections === "only" || pgSimpleCollections === "both";

  builder.hook("inflection", inflection => {
    return Object.assign(inflection, {
      manyToManyRelationByKeys(
        _leftKeys,
        junctionLeftKeys,
        junctionRightKeys,
        _rightKeys,
        junctionTable,
        rightTable
      ) {
        return this.camelCase(
          `${this.pluralize(
            this._singularizedTableName(rightTable)
          )}-by-${this._singularizedTableName(junctionTable)}-${[
            ...junctionLeftKeys,
            ...junctionRightKeys,
          ]
            .map(key => this.column(key))
            .join("-and-")}`
        );
      },
      manyToManyRelationByKeysSimple(
        _leftKeys,
        junctionLeftKeys,
        junctionRightKeys,
        _rightKeys,
        junctionTable,
        rightTable
      ) {
        return this.camelCase(
          `${this.pluralize(
            this._singularizedTableName(rightTable)
          )}-by-${this._singularizedTableName(junctionTable)}-${[
            ...junctionLeftKeys,
            ...junctionRightKeys,
          ]
            .map(key => this.column(key))
            .join("-and-")}-list`
        );
      },
      manyToManyEdge(
        _leftKeys,
        junctionLeftKeys,
        junctionRightKeys,
        _rightKeys,
        junctionTable,
        rightTable
      ) {
        return this.upperCamelCase(
          `${this.pluralize(
            this._singularizedTableName(rightTable)
          )}-by-${this._singularizedTableName(junctionTable)}-${[
            ...junctionLeftKeys,
            ...junctionRightKeys,
          ]
            .map(key => this.column(key))
            .join("-and-")}-edge`
        );
      },
      manyToManyConnection(
        _leftKeys,
        junctionLeftKeys,
        junctionRightKeys,
        _rightKeys,
        junctionTable,
        rightTable
      ) {
        return this.upperCamelCase(
          `${this.pluralize(
            this._singularizedTableName(rightTable)
          )}-by-${this._singularizedTableName(junctionTable)}-${[
            ...junctionLeftKeys,
            ...junctionRightKeys,
          ]
            .map(key => this.column(key))
            .join("-and-")}-connection`
        );
      },
    });
  });

  builder.hook("GraphQLObjectType:fields", (fields, build, context) => {
    const {
      extend,
      pgGetGqlTypeByTypeIdAndModifier,
      pgIntrospectionResultsByKind: introspectionResultsByKind,
      pgSql: sql,
      getSafeAliasFromResolveInfo,
      getSafeAliasFromAlias,
      graphql: { GraphQLNonNull, GraphQLList },
      inflection,
      pgQueryFromResolveData: queryFromResolveData,
      pgAddStartEndCursor: addStartEndCursor,
      pgOmit: omit,
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

    return extend(
      fields,
      leftTable.foreignConstraints
        .filter(con => con.type === "f")
        .reduce((memo, junctionLeftConstraint) => {
          if (omit(junctionLeftConstraint, "read")) {
            return memo;
          }
          const junctionTable =
            introspectionResultsByKind.classById[
              junctionLeftConstraint.classId
            ];
          if (!junctionTable) {
            throw new Error(
              `Could not find the table that referenced us (constraint: ${
                junctionLeftConstraint.name
              })`
            );
          }
          const junctionRightConstraint = junctionTable.constraints
            .filter(con => con.type === "f")
            .find(con => con.foreignClassId !== leftTable.id);
          if (!junctionRightConstraint) {
            return memo;
          }
          const rightTable = junctionRightConstraint.foreignClass;
          const rightTableTypeName = inflection.tableType(rightTable);
          const RightTableType = pgGetGqlTypeByTypeIdAndModifier(
            rightTable.type.id,
            null
          );
          if (!RightTableType) {
            debug(
              `Could not determine type for table with id ${
                junctionRightConstraint.classId
              }`
            );
            return memo;
          }

          const leftKeys = junctionLeftConstraint.foreignKeyAttributes;
          const junctionLeftKeys = junctionLeftConstraint.keyAttributes;
          const junctionRightKeys = junctionRightConstraint.keyAttributes;
          const rightKeys = junctionRightConstraint.foreignKeyAttributes;

          // Ensure keys were found
          if (
            !leftKeys.every(_ => _) ||
            !junctionLeftKeys.every(_ => _) ||
            !junctionRightKeys.every(_ => _) ||
            !rightKeys.every(_ => _)
          ) {
            throw new Error("Could not find key columns!");
          }

          // Ensure keys can be read
          if (
            leftKeys.some(key => omit(key, "read")) ||
            junctionLeftKeys.some(key => omit(key, "read")) ||
            junctionRightKeys.some(key => omit(key, "read")) ||
            rightKeys.some(key => omit(key, "read"))
          ) {
            return memo;
          }

          // Ensure both constraints are single-column
          // TODO: handle multi-column
          if (leftKeys.length > 1 || rightKeys.length > 1) {
            return memo;
          }

          // Since we're ignoring multi-column keys, we can simplify here
          const leftKey = leftKeys[0];
          const junctionLeftKey = junctionLeftKeys[0];
          const junctionRightKey = junctionRightKeys[0];
          const rightKey = rightKeys[0];

          // Ensure junction constraint keys are not unique (which would result in a one-to-one relation)
          const junctionLeftConstraintIsUnique = !!junctionTable.constraints.find(
            c =>
              (c.type === "p" || c.type === "u") &&
              c.keyAttributeNums.length === junctionLeftKeys.length &&
              c.keyAttributeNums.every((n, i) => junctionLeftKeys[i].num === n)
          );
          const junctionRightConstraintIsUnique = !!junctionTable.constraints.find(
            c =>
              (c.type === "p" || c.type === "u") &&
              c.keyAttributeNums.length === junctionRightKeys.length &&
              c.keyAttributeNums.every((n, i) => junctionRightKeys[i].num === n)
          );
          if (
            junctionLeftConstraintIsUnique ||
            junctionRightConstraintIsUnique
          ) {
            return memo;
          }

          /*
          // If there are no fields to add to the edges, just use this:
          const RightTableConnectionType = getTypeByName(
            inflection.connection(RightTableType.name)
          );
          */

          const junctionPrimaryKeyConstraint =
            junctionTable.primaryKeyConstraint;
          const junctionPrimaryKeys =
            junctionPrimaryKeyConstraint &&
            junctionPrimaryKeyConstraint.keyAttributes;

          const isNodeNullable = !pgForbidSetofFunctionsToReturnNull;
          const EdgeType = pgEdgeType(
            build,
            inflection.manyToManyEdge(
              leftKeys,
              junctionLeftKeys,
              junctionRightKeys,
              rightKeys,
              junctionTable,
              rightTable
            ),
            junctionTable,
            RightTableType,
            isNodeNullable,
            function pgQuery(queryBuilder) {
              if (junctionPrimaryKeys) {
                queryBuilder.select(
                  sql.fragment`json_build_array(${sql.join(
                    junctionPrimaryKeys.map(
                      key =>
                        sql.fragment`${queryBuilder.getTableAlias()}.${sql.identifier(
                          key.name
                        )}`
                    ),
                    ", "
                  )})`,
                  "__identifiers"
                );
              }
            },
            function resolveNode(data, _args, _context, resolveInfo) {
              const safeAlias = getSafeAliasFromResolveInfo(resolveInfo);
              return handleNullRow(data[safeAlias]);
            },
            { isPgManyToManyRowEdgeType: true }
          );
          const hasPageInfo = true;
          const ConnectionType = pgConnectionType(
            build,
            inflection.manyToManyConnection(
              leftKeys,
              junctionLeftKeys,
              junctionRightKeys,
              rightKeys,
              junctionTable,
              rightTable
            ),
            rightTable,
            RightTableType,
            EdgeType,
            hasPageInfo,
            isNodeNullable,
            function resolveNodes(data, _args, _context, resolveInfo) {
              const safeAlias = getSafeAliasFromResolveInfo(resolveInfo);
              return data.data.map(entry => handleNullRow(entry[safeAlias]));
            },
            function resolveEdges(data, _args, _context, resolveInfo) {
              const safeAlias = getSafeAliasFromResolveInfo(resolveInfo);
              return data.data.map(entry => ({
                __cursor: entry.__cursor,
                ...entry[safeAlias],
              }));
            },
            { isPgRowConnectionType: true }
          );

          function makeFields(isConnection) {
            const manyRelationFieldName = isConnection
              ? inflection.manyToManyRelationByKeys(
                  leftKeys,
                  junctionLeftKeys,
                  junctionRightKeys,
                  rightKeys,
                  junctionTable,
                  rightTable
                )
              : inflection.manyToManyRelationByKeysSimple(
                  leftKeys,
                  junctionLeftKeys,
                  junctionRightKeys,
                  rightKeys,
                  junctionTable,
                  rightTable
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
                    addDataGenerator(parsedResolveInfoFragment => {
                      return {
                        pgQuery: queryBuilder => {
                          queryBuilder.select(() => {
                            const resolveData = getDataFromParsedResolveInfoFragment(
                              parsedResolveInfoFragment,
                              isConnection ? ConnectionType : RightTableType
                            );
                            const rightTableAlias = sql.identifier(Symbol());
                            const leftTableAlias = queryBuilder.getTableAlias();
                            const query = queryFromResolveData(
                              sql.identifier(
                                rightTable.namespace.name,
                                rightTable.name
                              ),
                              rightTableAlias,
                              resolveData,
                              {
                                withPagination: isConnection,
                                withPaginationAsFields: false,
                                asJsonAggregate: !isConnection,
                              },
                              innerQueryBuilder => {
                                innerQueryBuilder.parentQueryBuilder = queryBuilder;
                                const rightPrimaryKeyConstraint =
                                  rightTable.primaryKeyConstraint;
                                const rightPrimaryKeys =
                                  rightPrimaryKeyConstraint &&
                                  rightPrimaryKeyConstraint.keyAttributes;
                                if (rightPrimaryKeys) {
                                  innerQueryBuilder.beforeLock(
                                    "orderBy",
                                    () => {
                                      // append order by primary key to the list of orders
                                      if (
                                        !innerQueryBuilder.isOrderUnique(false)
                                      ) {
                                        innerQueryBuilder.data.cursorPrefix = [
                                          "primary_key_asc",
                                        ];
                                        rightPrimaryKeys.forEach(key => {
                                          innerQueryBuilder.orderBy(
                                            sql.fragment`${innerQueryBuilder.getTableAlias()}.${sql.identifier(
                                              key.name
                                            )}`,
                                            true
                                          );
                                        });
                                        innerQueryBuilder.setOrderIsUnique();
                                      }
                                    }
                                  );
                                }

                                innerQueryBuilder.where(
                                  sql.fragment`${rightTableAlias}.${sql.identifier(
                                    rightKey.name
                                  )} in (select ${sql.identifier(
                                    junctionRightKey.name
                                  )} from ${sql.identifier(
                                    junctionTable.namespace.name,
                                    junctionTable.name
                                  )} where ${sql.identifier(
                                    junctionLeftKey.name
                                  )} = ${leftTableAlias}.${sql.identifier(
                                    leftKey.name
                                  )})`
                                );
                              }
                            );
                            return sql.fragment`(${query})`;
                          }, getSafeAliasFromAlias(parsedResolveInfoFragment.alias));
                        },
                      };
                    });

                    return {
                      description: `Reads and enables pagination through a set of \`${rightTableTypeName}\`.`,
                      type: isConnection
                        ? new GraphQLNonNull(ConnectionType)
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

              `Many-to-many relation (${
                isConnection ? "connection" : "simple collection"
              }) for ${describePgEntity(
                junctionLeftConstraint
              )} and ${describePgEntity(junctionRightConstraint)}.`
            );
          }
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
