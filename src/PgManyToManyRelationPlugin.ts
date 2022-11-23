import type {} from "graphile-config";
import type {} from "postgraphile";
import createManyToManyConnectionType from "./createManyToManyConnectionType";
import manyToManyRelationships from "./manyToManyRelationships";

const version = require("../../package.json").version;

export const PgManyToManyRelationPlugin: GraphileConfig.Plugin = {
  name: "PgManyToManyRelationPlugin",
  version,

  schema: {
    hooks: {
      init(_, build, context) {
        for (const leftTable of build.input.pgSources) {
          if (!leftTable.codec.columns || leftTable.parameters) {
            continue;
          }

          const relationships = manyToManyRelationships(leftTable, build);

          for (const relationship of relationships) {
            const {
              leftRelationName,
              junctionTable,
              rightRelationName,
              rightTable,
            } = relationship;
            createManyToManyConnectionType(relationship, build, leftTable);
          }
        }
        return _;
      },
      GraphQLObjectType_fields(fields, build, context) {
        const {
          extend,
          sql,
          graphql: { GraphQLNonNull, GraphQLList },
          inflection,
        } = build;
        const {
          scope: { isPgTableType, pgCodec: leftTableCodec },
          fieldWithHooks,
          Self,
        } = context;
        if (!isPgTableType || !leftTableCodec || !leftTableCodec.columns) {
          return fields;
        }

        const leftTables = build.input.pgSources.filter(
          (s) => s.codec === leftTableCodec && !s.parameters
        );
        if (leftTables.length !== 1) {
          if (leftTables.length > 2) {
            throw new Error(
              `PgManyToMany: there are multiple parameterless sources for codec '${leftTableCodec.name}', we can't determine which one to use.`
            );
          }
          return fields;
        }
        const leftTable = leftTables[0];

        const relationships = manyToManyRelationships(leftTable, build);
        return extend(
          fields,
          relationships.reduce((memo, relationship) => {
            const {
              leftTable,
              leftRelationName,
              junctionTable,
              rightRelationName,
              rightTable,
            } = relationship;
            const RightTableType = build.getGraphQLTypeByPgCodec(
              rightTable.codec,
              "output"
            );
            if (!RightTableType) {
              throw new Error(
                `Could not determine output type for table ${rightTable.name}`
              );
            }
            const RightTableConnectionType = createManyToManyConnectionType(
              relationship,
              build,
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
                      addDataGenerator((parsedResolveInfoFragment) => {
                        return {
                          pgQuery: (queryBuilder) => {
                            queryBuilder.select(() => {
                              const resolveData =
                                getDataFromParsedResolveInfoFragment(
                                  parsedResolveInfoFragment,
                                  isConnection
                                    ? RightTableConnectionType
                                    : RightTableType
                                );
                              const rightTableAlias = sql.identifier(Symbol());
                              const leftTableAlias =
                                queryBuilder.getTableAlias();
                              const query = queryFromResolveData(
                                sqlFrom,
                                rightTableAlias,
                                resolveData,
                                queryOptions,
                                (innerQueryBuilder) => {
                                  innerQueryBuilder.parentQueryBuilder =
                                    queryBuilder;
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
                                          !innerQueryBuilder.isOrderUnique(
                                            false
                                          )
                                        ) {
                                          innerQueryBuilder.data.cursorPrefix =
                                            ["primary_key_asc"];
                                          rightPrimaryKeyAttributes.forEach(
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
                                      }
                                    );
                                  }

                                  const subqueryName =
                                    inflection.manyToManyRelationSubqueryName(
                                      leftKeyAttributes,
                                      junctionLeftKeyAttributes,
                                      junctionRightKeyAttributes,
                                      rightKeyAttributes,
                                      junctionTable,
                                      rightTable,
                                      junctionLeftConstraint,
                                      junctionRightConstraint
                                    );
                                  const subqueryBuilder =
                                    innerQueryBuilder.buildNamedChildSelecting(
                                      subqueryName,
                                      sql.identifier(
                                        junctionTable.namespace.name,
                                        junctionTable.name
                                      ),
                                      sql.identifier(
                                        junctionRightKeyAttribute.name
                                      )
                                    );
                                  subqueryBuilder.where(
                                    sql.fragment`${sql.identifier(
                                      junctionLeftKeyAttribute.name
                                    )} = ${leftTableAlias}.${sql.identifier(
                                      leftKeyAttribute.name
                                    )}`
                                  );

                                  innerQueryBuilder.where(
                                    () =>
                                      sql.fragment`${rightTableAlias}.${sql.identifier(
                                        rightKeyAttribute.name
                                      )} in (${subqueryBuilder.build()})`
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
                              new GraphQLList(
                                new GraphQLNonNull(RightTableType)
                              )
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
      },
    },
  },
};
