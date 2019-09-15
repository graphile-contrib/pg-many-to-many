const isEqual = require("lodash/isEqual");

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
          `Could not find the table that referenced us (constraint: ${
            junctionLeftConstraint.name
          })`
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
              (c.type === "p" || c.type === "u") &&
              isEqual(
                c.keyAttributeNums,
                junctionLeftKeyAttributes.map(a => a.num)
              )
          );
          const junctionRightConstraintIsUnique = !!junctionTable.constraints.find(
            c =>
              (c.type === "p" || c.type === "u") &&
              isEqual(
                c.keyAttributeNums,
                junctionRightKeyAttributes.map(a => a.num)
              )
          );
          if (
            junctionLeftConstraintIsUnique ||
            junctionRightConstraintIsUnique
          ) {
            return memoRight;
          }

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
            },
          ];
        }, []);
      return [...memoLeft, ...memoRight];
    }, []);
}

module.exports = function PgManyToManyRelationPlugin(
  builder,
  { pgSimpleCollections }
) {
  builder.hook("inflection", inflection => {
    return Object.assign(inflection, {
      manyToManyRelationByKeys(
        _leftKeyAttributes,
        junctionLeftKeyAttributes,
        junctionRightKeyAttributes,
        _rightKeyAttributes,
        junctionTable,
        rightTable,
        _junctionLeftConstraint,
        junctionRightConstraint
      ) {
        if (junctionRightConstraint.tags.manyToManyFieldName) {
          return junctionRightConstraint.tags.manyToManyFieldName;
        }
        return this.camelCase(
          `${this.pluralize(
            this._singularizedTableName(rightTable)
          )}-by-${this._singularizedTableName(junctionTable)}-${[
            ...junctionLeftKeyAttributes,
            ...junctionRightKeyAttributes,
          ]
            .map(attr => this.column(attr))
            .join("-and-")}`
        );
      },
      manyToManyRelationByKeysSimple(
        _leftKeyAttributes,
        junctionLeftKeyAttributes,
        junctionRightKeyAttributes,
        _rightKeyAttributes,
        junctionTable,
        rightTable,
        _junctionLeftConstraint,
        junctionRightConstraint
      ) {
        if (junctionRightConstraint.tags.manyToManySimpleFieldName) {
          return junctionRightConstraint.tags.manyToManySimpleFieldName;
        }
        return this.camelCase(
          `${this.pluralize(
            this._singularizedTableName(rightTable)
          )}-by-${this._singularizedTableName(junctionTable)}-${[
            ...junctionLeftKeyAttributes,
            ...junctionRightKeyAttributes,
          ]
            .map(attr => this.column(attr))
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
      relationships.reduce(
        (
          memo,
          {
            leftKeyAttributes,
            junctionLeftKeyAttributes,
            junctionRightKeyAttributes,
            rightKeyAttributes,
            junctionTable,
            rightTable,
            junctionLeftConstraint,
            junctionRightConstraint,
          }
        ) => {
          const rightTableTypeName = inflection.tableType(rightTable);
          const RightTableType = pgGetGqlTypeByTypeIdAndModifier(
            rightTable.type.id,
            null
          );
          if (!RightTableType) {
            throw new Error(
              `Could not determine type for table with id ${
                junctionRightConstraint.classId
              }`
            );
          }
          const RightTableConnectionType = getTypeByName(
            inflection.connection(RightTableType.name)
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
                                const rightPrimaryKeyAttributes =
                                  rightPrimaryKeyConstraint &&
                                  rightPrimaryKeyConstraint.keyAttributes;
                                if (rightPrimaryKeyAttributes) {
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
                                        rightPrimaryKeyAttributes.forEach(
                                          attr => {
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
                                    }
                                  );
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
        },
        {}
      ),
      `Adding many-to-many relations for ${Self.name}`
    );
  });
};
