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
    if (row.hasOwnProperty(k)) {
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
  context,
  { pgForbidSetofFunctionsToReturnNull = false }
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
    allowsMultipleEdgesToNode,
  } = relationship;
  const {
    extend,
    newWithHooks,
    inflection,
    graphql: { GraphQLObjectType, GraphQLNonNull, GraphQLList, GraphQLString },
    pgColumnFilter,
    pgOmit: omit,
    pgSql: sql,
    pg2gql,
    getTypeByName,
    pgGetGqlTypeByTypeIdAndModifier,
    describePgEntity,
    sqlCommentByAddingTags,
    pgField,
    pgGetSelectValueForFieldAndTypeAndModifier: getSelectValueForFieldAndTypeAndModifier,
    getSafeAliasFromResolveInfo,
    subscriptions = false,
  } = build;
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

  const TableType = pgGetGqlTypeByTypeIdAndModifier(rightTable.type.id, null);
  if (!TableType) {
    throw new Error(
      `Could not determine type for table with id ${rightTable.type.id}`
    );
  }

  const primaryKeyConstraint = rightTable.primaryKeyConstraint;
  const primaryKeys =
    primaryKeyConstraint && primaryKeyConstraint.keyAttributes;

  const junctionAttributes = junctionTable.attributes.filter(
    attr =>
      pgColumnFilter(attr, build, context) &&
      !omit(attr, "filter") &&
      !junctionLeftKeyAttributes.includes(attr) &&
      !junctionRightKeyAttributes.includes(attr)
  );
  const junctionTypeName = inflection.tableType(junctionTable);
  const base64 = str => Buffer.from(String(str)).toString("base64");

  const EdgeType = newWithHooks(
    GraphQLObjectType,
    {
      description: `A \`${
        TableType.name
      }\` edge in the connection, with data from \`${junctionTypeName}\`.`,
      name: inflection.manyToManyRelationEdge(
        leftKeyAttributes,
        junctionLeftKeyAttributes,
        junctionRightKeyAttributes,
        rightKeyAttributes,
        junctionTable,
        rightTable,
        junctionLeftConstraint,
        junctionRightConstraint
      ),
      fields: ({ fieldWithHooks }) => {
        const edgeFields = {
          cursor: fieldWithHooks(
            "cursor",
            ({ addDataGenerator }) => {
              addDataGenerator(() => ({
                usesCursor: [true],
                pgQuery: queryBuilder => {
                  if (primaryKeys) {
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
              resolve(data, _args, resolveContext, resolveInfo) {
                const safeAlias = getSafeAliasFromResolveInfo(resolveInfo);
                const record = handleNullRow(
                  data[safeAlias],
                  data.__identifiers
                );
                const liveRecord =
                  resolveInfo.rootValue && resolveInfo.rootValue.liveRecord;
                if (record && primaryKeys && liveRecord && data.__identifiers) {
                  liveRecord("pg", rightTable, data.__identifiers);
                }
                return record;
              },
            },
            {},
            false,
            {
              withQueryBuilder: queryBuilder => {
                if (subscriptions) {
                  queryBuilder.selectIdentifiers(rightTable);
                }
              },
            }
          ),
        };

        const fieldsFromAttributes = attributes =>
          attributes.reduce((memo, attr) => {
            const fieldName = inflection.column(attr);
            if (memo[fieldName]) {
              throw new Error(
                `Two columns produce the same GraphQL field name '${fieldName}' on class '${
                  rightTable.namespaceName
                }.${rightTable.name}'; one of them is '${attr.name}'`
              );
            }
            memo = extend(
              memo,
              {
                [fieldName]: fieldWithHooks(
                  fieldName,
                  fieldContext => {
                    const { type, typeModifier } = attr;
                    const { addDataGenerator } = fieldContext;
                    const ReturnType =
                      pgGetGqlTypeByTypeIdAndModifier(
                        attr.typeId,
                        attr.typeModifier
                      ) || GraphQLString;
                    addDataGenerator(parsedResolveInfoFragment => {
                      return {
                        pgQuery: queryBuilder => {
                          // Since we're ignoring multi-column keys, we can simplify here
                          const leftKeyAttribute = leftKeyAttributes[0];
                          const junctionLeftKeyAttribute =
                            junctionLeftKeyAttributes[0];
                          const junctionRightKeyAttribute =
                            junctionRightKeyAttributes[0];
                          const rightKeyAttribute = rightKeyAttributes[0];

                          queryBuilder.select(
                            getSelectValueForFieldAndTypeAndModifier(
                              ReturnType,
                              fieldContext,
                              parsedResolveInfoFragment,
                              sql.fragment`(select ${sql.identifier(
                                attr.name
                              )} from ${sql.identifier(
                                junctionTable.namespace.name,
                                junctionTable.name
                              )} where ${sql.identifier(
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
                    return {
                      description: attr.description,
                      type: nullableIf(
                        !attr.isNotNull &&
                          !attr.type.domainIsNotNull &&
                          !attr.tags.notNull,
                        ReturnType
                      ),
                      resolve: data => {
                        return pg2gql(data[fieldName], type);
                      },
                    };
                  },
                  { pgFieldIntrospection: attr }
                ),
              },
              `Adding field for ${describePgEntity(
                attr
              )}. You can rename this field with:\n\n  ${sqlCommentByAddingTags(
                attr,
                {
                  name: "newNameHere",
                }
              )}`
            );
            return memo;
          }, {});

        if (allowsMultipleEdgesToNode) {
          return edgeFields;
        } else {
          return extend(edgeFields, fieldsFromAttributes(junctionAttributes));
        }
      },
    },
    {
      isEdgeType: true,
      isPgRowEdgeType: true,
      nodeType: TableType,
      pgManyToManyRelationship: relationship,
    }
  );
  const PageInfo = getTypeByName(inflection.builtin("PageInfo"));

  return newWithHooks(
    GraphQLObjectType,
    {
      description: `A connection to a list of \`${
        TableType.name
      }\` values, with data from \`${junctionTypeName}\`.`,
      name: inflection.manyToManyRelationConnection(
        leftKeyAttributes,
        junctionLeftKeyAttributes,
        junctionRightKeyAttributes,
        rightKeyAttributes,
        junctionTable,
        rightTable,
        junctionLeftConstraint,
        junctionRightConstraint
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
              resolve(data, _args, resolveContext, resolveInfo) {
                const safeAlias = getSafeAliasFromResolveInfo(resolveInfo);
                const liveRecord =
                  resolveInfo.rootValue && resolveInfo.rootValue.liveRecord;
                return data.data.map(entry => {
                  const record = handleNullRow(
                    entry[safeAlias],
                    entry[safeAlias].__identifiers
                  );
                  if (
                    record &&
                    liveRecord &&
                    primaryKeys &&
                    entry[safeAlias].__identifiers
                  ) {
                    liveRecord(
                      "pg",
                      rightTable,
                      entry[safeAlias].__identifiers
                    );
                  }

                  return record;
                });
              },
            },
            {},
            false,
            {
              withQueryBuilder: queryBuilder => {
                if (subscriptions) {
                  queryBuilder.selectIdentifiers(rightTable);
                }
              },
            }
          ),
          edges: pgField(
            build,
            fieldWithHooks,
            "edges",
            {
              description: `A list of edges which contains the \`${
                TableType.name
              }\`, info from the \`${junctionTypeName}\`, and the cursor to aid in pagination.`,
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
    }
  );
}

module.exports = function PgManyToManyRelationPlugin(builder, options) {
  const { pgSimpleCollections } = options;
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
      manyToManyRelationEdge(
        leftKeyAttributes,
        junctionLeftKeyAttributes,
        junctionRightKeyAttributes,
        rightKeyAttributes,
        junctionTable,
        rightTable,
        junctionLeftConstraint,
        junctionRightConstraint
      ) {
        const relationName = inflection.manyToManyRelationByKeys(
          leftKeyAttributes,
          junctionLeftKeyAttributes,
          junctionRightKeyAttributes,
          rightKeyAttributes,
          junctionTable,
          rightTable,
          junctionLeftConstraint,
          junctionRightConstraint
        );
        return this.upperCamelCase(`${relationName}-edge`);
      },
      manyToManyRelationConnection(
        leftKeyAttributes,
        junctionLeftKeyAttributes,
        junctionRightKeyAttributes,
        rightKeyAttributes,
        junctionTable,
        rightTable,
        junctionLeftConstraint,
        junctionRightConstraint
      ) {
        const relationName = inflection.manyToManyRelationByKeys(
          leftKeyAttributes,
          junctionLeftKeyAttributes,
          junctionRightKeyAttributes,
          rightKeyAttributes,
          junctionTable,
          rightTable,
          junctionLeftConstraint,
          junctionRightConstraint
        );
        return this.upperCamelCase(`${relationName}-connection`);
      },
    });
  });

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
            `Could not determine type for table with id ${
              junctionRightConstraint.classId
            }`
          );
        }
        const RightTableConnectionType = createManyToManyConnectionType(
          relationship,
          build,
          context,
          options
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

                  const rightTableTypeName = inflection.tableType(rightTable);
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
                  pgManyToManyLeftTable: leftTable,
                  pgManyToManyLeftKeyAttributes: leftKeyAttributes,
                  pgManyToManyRightTable: rightTable,
                  pgManyToManyRightKeyAttributes: rightKeyAttributes,
                  pgManyToManyJunctionTable: junctionTable,
                  pgManyToManyJunctionLeftConstraint: junctionLeftConstraint,
                  pgManyToManyJunctionRightConstraint: junctionRightConstraint,
                  pgManyToManyJunctionLeftKeyAttributes: junctionLeftKeyAttributes,
                  pgManyToManyJunctionRightKeyAttributes: junctionRightKeyAttributes,
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
