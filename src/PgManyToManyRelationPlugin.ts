import { PgResource, PgSelectSingleStep, TYPES } from "@dataplan/pg";
import { connection, each, object } from "grafast";
import type {} from "graphile-config";
import { GraphQLObjectType } from "graphql";
import type {} from "postgraphile";
import createManyToManyConnectionType from "./createManyToManyConnectionType";
import manyToManyRelationships from "./manyToManyRelationships";
import { PgTableResource } from ".";
import { SQL } from "pg-sql2";

const version = require("../package.json").version;

export const junctionSymbol = Symbol("junction");

export const PgManyToManyRelationPlugin: GraphileConfig.Plugin = {
  name: "PgManyToManyRelationPlugin",
  version,

  schema: {
    hooks: {
      init(_, build, _context) {
        for (const rawResource of Object.values(
          build.input.pgRegistry.pgResources
        )) {
          if (!rawResource.codec.columns || rawResource.parameters) {
            continue;
          }
          const leftTable = rawResource as PgTableResource;

          const relationships = manyToManyRelationships(leftTable, build);

          for (const relationship of relationships) {
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

        const leftTables = Object.values(
          build.input.pgRegistry.pgResources
        ).filter((s) => s.codec === leftTableCodec && !s.parameters);
        if (leftTables.length !== 1) {
          if (leftTables.length > 2) {
            throw new Error(
              `PgManyToMany: there are multiple parameterless sources for codec '${leftTableCodec.name}', we can't determine which one to use.`
            );
          }
          return fields;
        }
        const leftTable = leftTables[0] as PgTableResource;

        const relationships = manyToManyRelationships(leftTable, build);
        return extend(
          fields,
          relationships.reduce(
            (memo, relationship) =>
              build.recoverable(memo, () => {
                const {
                  leftTable,
                  leftRelationName,
                  junctionTable,
                  rightRelationName,
                  rightTable,
                  allowsMultipleEdgesToNode,
                } = relationship;
                const RightTableType = build.getGraphQLTypeByPgCodec(
                  rightTable.codec,
                  "output"
                ) as GraphQLObjectType | null;
                if (!RightTableType) {
                  throw new Error(
                    `Could not determine output type for table ${rightTable.name}`
                  );
                }
                const leftTableTypeName = inflection.tableType(leftTable.codec);
                const connectionTypeName =
                  inflection.manyToManyRelationConnectionType({
                    ...relationship,
                    leftTableTypeName,
                  });
                const RightTableConnectionType = build.getTypeByName(
                  connectionTypeName
                ) as GraphQLObjectType | null;
                if (!RightTableConnectionType) {
                  throw new Error(
                    `Could not find connection type for table ${rightTable.name}`
                  );
                }

                const leftRelation = leftTable.getRelation(leftRelationName);
                if (typeof leftRelation.remoteResource.source === "function") {
                  throw new Error(
                    `Function resource not supported for relation`
                  );
                }
                const leftRelationSource = leftRelation.remoteResource.source;
                const leftTableRelationColumnNames = leftRelation.localColumns;
                const leftJunctionColumnNames = leftRelation.remoteColumns;
                const leftJunctionColumnCodecs = leftJunctionColumnNames.map(
                  (colName) => junctionTable.codec.columns[colName].codec
                );
                const rightRelation =
                  junctionTable.getRelation(rightRelationName);
                const rightJunctionColumnNames = rightRelation.localColumns;
                const rightJunctionColumnCodecs = rightJunctionColumnNames.map(
                  (colName) => junctionTable.codec.columns[colName].codec
                );
                const rightTableRelationColumnNames =
                  rightRelation.remoteColumns;

                // TODO: throw an error if localColumns or remoteColumns involve
                // `via` or `expression` - we only want pure column relations.

                function makeFields(isConnection: boolean) {
                  const manyRelationFieldName = isConnection
                    ? inflection.manyToManyRelationConnectionField(relationship)
                    : inflection.manyToManyRelationListField(relationship);

                  memo = build.recoverable(memo, () =>
                    extend(
                      memo,
                      {
                        [manyRelationFieldName]: fieldWithHooks(
                          {
                            fieldName: manyRelationFieldName,
                            pgResource: rightTable,
                            isPgFieldConnection: isConnection,
                            isPgFieldSimpleCollection: !isConnection,
                            isPgManyToManyRelationField: true,
                            pgManyToManyRightTable: rightTable,
                          },
                          () => ({
                            description: `Reads and enables pagination through a set of \`${
                              RightTableType!.name
                            }\`.`,
                            type: isConnection
                              ? new GraphQLNonNull(RightTableConnectionType!)
                              : new GraphQLNonNull(
                                  new GraphQLList(
                                    new GraphQLNonNull(RightTableType!)
                                  )
                                ),
                            args: Object.create(null),
                            plan($left: PgSelectSingleStep) {
                              const $rights =
                                rightRelation.remoteResource.find();
                              const junctionAlias =
                                sql.identifier(junctionSymbol);
                              const rightIdentifiers =
                                rightTableRelationColumnNames.map(
                                  (n) =>
                                    sql`${$rights.alias}.${sql.identifier(n)}`
                                );
                              const conditions: SQL[] = [];
                              for (
                                let i = 0, l = leftJunctionColumnNames.length;
                                i < l;
                                i++
                              ) {
                                conditions.push(
                                  sql`${junctionAlias}.${sql.identifier(
                                    leftJunctionColumnNames[i]
                                  )} = ${$rights.placeholder(
                                    $left.get(leftTableRelationColumnNames[i])
                                  )}`
                                );
                              }
                              const junctionSubquery = sql.indent`select ${sql.join(
                                rightJunctionColumnNames.map(
                                  (n) =>
                                    sql`${junctionAlias}.${sql.identifier(n)}`
                                ),
                                ", "
                              )}
from ${leftRelationSource} ${junctionAlias}
where ${sql.join(
                                conditions.map((c) => sql.indent(c)),
                                "\nand\n"
                              )}`;
                              $rights.where(
                                sql`(${sql.join(
                                  rightIdentifiers,
                                  ", "
                                )}) in (${junctionSubquery})`
                              );

                              return isConnection
                                ? (connection($rights) as any)
                                : $rights;
                            },
                            /*
                            plan($left: PgSelectSingleStep) {
                              const $junctions =
                                $left.manyRelation(leftRelationName);
                              // Fetch the identifiers and the return the relevant
                              // rightTable entries for them.
                              const $rightIdentifiers = each(
                                $junctions,
                                ($junction) => {
                                  const spec = Object.create(null);

                                  for (const colName of leftJunctionColumnNames) {
                                    spec[colName] = (
                                      $junction as PgSelectSingleStep
                                    ).get(colName);
                                  }
                                  for (const colName of rightJunctionColumnNames) {
                                    spec[colName] = (
                                      $junction as PgSelectSingleStep
                                    ).get(colName);
                                  }

                                  return object(spec);
                                }
                              );
                              const $rights = rightTable.find();

                              // Join the rights to our junction entries; we do
                              // this because we need to be able to access the
                              // junction identifier in
                              // PgManyToManyRelationEdgeTablePlugin (otherwise we
                              // could have just done a `where` subquery).
                              const junctionAlias =
                                sql.identifier(junctionSymbol);
                              if (allowsMultipleEdgesToNode) {
                                $rights.join({
                                  type: "inner",
                                  source: sql`(${sql.indent`\
select distinct ${sql.join(
                                    leftJunctionColumnNames.map(
                                      (colName, i) =>
                                        sql`(el.el->>${sql.literal(
                                          colName
                                        )})::${
                                          leftJunctionColumnCodecs[i].sqlType
                                        } as ${sql.identifier(colName)}`
                                    ),
                                    ", "
                                  )}, ${sql.join(
                                    rightJunctionColumnNames.map(
                                      (colName, i) =>
                                        sql`(el.el->>${sql.literal(
                                          colName
                                        )})::${
                                          rightJunctionColumnCodecs[i].sqlType
                                        } as ${sql.identifier(colName)}`
                                    ),
                                    ", "
                                  )} from json_array_elements(${$rights.placeholder(
                                    $rightIdentifiers,
                                    TYPES.json
                                  )}) as el(el)`})`,
                                  alias: junctionAlias,
                                  conditions: [
                                    ...rightJunctionColumnNames.map(
                                      (junctionColName, i) => {
                                        const rightColName =
                                          rightTableRelationColumnNames[i];
                                        const sqlRight = sql`${
                                          $rights.alias
                                        }.${sql.identifier(
                                          // TODO: is this safe? What if this column has `via` or `expression`?
                                          rightColName
                                        )}`;
                                        return sql`${junctionAlias}.${sql.identifier(
                                          junctionColName
                                        )} = ${sqlRight}`;
                                      }
                                    ),
                                  ],
                                });
                              } else {
                                const junctionTableSource =
                                  junctionTable.source;
                                if (typeof junctionTableSource === "function") {
                                  throw new Error(`Function source forbidden`);
                                }
                                $rights.join({
                                  type: "inner",
                                  source: junctionTableSource,
                                  alias: junctionAlias,
                                  conditions: [
                                    sql`(${sql.join(
                                      leftJunctionColumnNames.map(
                                        (junctionColName, i) => {
                                          return sql`${junctionAlias}.${sql.identifier(
                                            // TODO: is this safe? What if this column has `via` or `expression`?
                                            junctionColName
                                          )}`;
                                        }
                                      ),
                                      ", "
                                    )}) in (
                              select distinct ${sql.join(
                                leftJunctionColumnNames.map(
                                  (colName, i) =>
                                    sql`(el.el->>${sql.literal(colName)})::${
                                      leftJunctionColumnCodecs[i].sqlType
                                    } as ${sql.identifier(colName)}`
                                ),
                                ", "
                              )} from json_array_elements(${$rights.placeholder(
                                      $rightIdentifiers,
                                      TYPES.json
                                    )}) as el(el))`,

                                    ...rightJunctionColumnNames.map(
                                      (junctionColName, i) => {
                                        const rightColName =
                                          rightTableRelationColumnNames[i];
                                        const sqlRight = sql`${
                                          $rights.alias
                                        }.${sql.identifier(
                                          // TODO: is this safe? What if this column has `via` or `expression`?
                                          rightColName
                                        )}`;
                                        return sql`${junctionAlias}.${sql.identifier(
                                          junctionColName
                                        )} = ${sqlRight}`;
                                      }
                                    ),
                                  ],
                                });
                              }

                              return isConnection
                                ? (connection($rights) as any)
                                : $rights;
                            },*/
                          })
                        ),
                      },

                      `Many-to-many relation field (${
                        isConnection ? "connection" : "simple collection"
                      }) on ${
                        Self.name
                      } type for ${leftRelationName} and ${rightRelationName}.`
                    )
                  );
                }

                const behavior = build.pgGetBehavior([
                  junctionTable.extensions,
                  junctionTable.getRelation(rightRelationName).extensions,
                  rightTable.extensions,
                ]);

                if (
                  build.behavior.matches(behavior, "manyToMany", "manyToMany")
                ) {
                  if (
                    build.behavior.matches(
                      behavior,
                      "connection",
                      "connection -list"
                    )
                  ) {
                    makeFields(true);
                  }
                  if (
                    build.behavior.matches(behavior, "list", "connection -list")
                  ) {
                    makeFields(false);
                  }
                }
                return memo;
              }),
            Object.create(null)
          ),
          `Adding many-to-many relations for ${Self.name}`
        );
      },
    },
  },
};
