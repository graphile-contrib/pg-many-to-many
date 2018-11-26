const debugFactory = require("debug");
const debug = debugFactory("graphile-build-pg");

module.exports = function PgManyToManyRelationPlugin(
  builder,
  { pgSimpleCollections }
) {
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
    });
  });

  builder.hook("GraphQLObjectType:fields", (fields, build, context) => {
    const {
      extend,
      getTypeByName,
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
          const RightTableConnectionType = getTypeByName(
            inflection.connection(RightTableType.name)
          );

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
                              isConnection
                                ? RightTableConnectionType
                                : RightTableType
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
