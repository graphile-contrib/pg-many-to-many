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
                const junctionSource = leftRelation.remoteResource.source;
                const leftTableColumnNames = leftRelation.localColumns;
                const leftJunctionColumnNames = leftRelation.remoteColumns;
                const rightRelation =
                  junctionTable.getRelation(rightRelationName);
                const rightJunctionColumnNames = rightRelation.localColumns;
                const rightTableColumnNames = rightRelation.remoteColumns;
                const rightResource = rightRelation.remoteResource;
                const junctionAlias = sql.identifier(junctionSymbol);
                const leftColumnCount = leftJunctionColumnNames.length;
                const rightColumnCount = rightJunctionColumnNames.length;

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
                            plan:
                              allowsMultipleEdgesToNode && isConnection
                                ? // Distinct join strategy so we can determine the joined-on records for edges.
                                  ($left: PgSelectSingleStep) => {
                                    const $rights = rightResource.find();

                                    const leftConditions: SQL[] = [];
                                    for (let i = 0; i < leftColumnCount; i++) {
                                      leftConditions.push(
                                        sql`${junctionAlias}.${sql.identifier(
                                          leftJunctionColumnNames[i]
                                        )} = ${$rights.placeholder(
                                          $left.get(leftTableColumnNames[i])
                                        )}`
                                      );
                                    }

                                    const rightConditions: SQL[] = [];
                                    for (let i = 0; i < rightColumnCount; i++) {
                                      rightConditions.push(
                                        sql`${junctionAlias}.${sql.identifier(
                                          rightJunctionColumnNames[i]
                                        )} = ${$rights.alias}.${sql.identifier(
                                          rightTableColumnNames[i]
                                        )}`
                                      );
                                    }

                                    // Join to a distinct version of junction table
                                    const leftDistinctSource = sql`(${sql.indent`select distinct ${sql.join(
                                      leftJunctionColumnNames.map(
                                        (c) =>
                                          sql`${junctionAlias}.${sql.identifier(
                                            c
                                          )}`
                                      ),
                                      ", "
                                    )}, ${sql.join(
                                      rightJunctionColumnNames.map(
                                        (c) =>
                                          sql`${junctionAlias}.${sql.identifier(
                                            c
                                          )}`
                                      ),
                                      ", "
                                    )}\n
from ${junctionSource} ${junctionAlias}
where ${sql.join(leftConditions, "\nand ")}
`})`;
                                    $rights.join({
                                      type: "inner",
                                      conditions: rightConditions,
                                      alias: junctionAlias,
                                      source: leftDistinctSource,
                                    });

                                    return connection($rights) as any;
                                  }
                                : isConnection
                                ? // Simple join strategy so we can grab columns on the connection edges
                                  ($left: PgSelectSingleStep) => {
                                    const $rights = rightResource.find();

                                    const leftConditions: SQL[] = [];
                                    for (let i = 0; i < leftColumnCount; i++) {
                                      leftConditions.push(
                                        sql`${junctionAlias}.${sql.identifier(
                                          leftJunctionColumnNames[i]
                                        )} = ${$rights.placeholder(
                                          $left.get(leftTableColumnNames[i])
                                        )}`
                                      );
                                    }

                                    const rightConditions: SQL[] = [];
                                    for (let i = 0; i < rightColumnCount; i++) {
                                      rightConditions.push(
                                        sql`${junctionAlias}.${sql.identifier(
                                          rightJunctionColumnNames[i]
                                        )} = ${$rights.alias}.${sql.identifier(
                                          rightTableColumnNames[i]
                                        )}`
                                      );
                                    }

                                    // Join to junction table
                                    $rights.join({
                                      type: "inner",
                                      conditions: rightConditions,
                                      alias: junctionAlias,
                                      source: junctionSource,
                                    });

                                    // Limit to only the junction entries that match $left
                                    for (const leftCondition of leftConditions) {
                                      $rights.where(leftCondition);
                                    }

                                    return connection($rights) as any;
                                  }
                                : // Subquery strategy - most efficient, but we cannot query columns from the junction table
                                  ($left: PgSelectSingleStep) => {
                                    const $rights = rightResource.find();

                                    const leftConditions: SQL[] = [];
                                    for (let i = 0; i < leftColumnCount; i++) {
                                      leftConditions.push(
                                        sql`${junctionAlias}.${sql.identifier(
                                          leftJunctionColumnNames[i]
                                        )} = ${$rights.placeholder(
                                          $left.get(leftTableColumnNames[i])
                                        )}`
                                      );
                                    }

                                    const rightJunctionColumns = sql`(${sql.join(
                                      rightJunctionColumnNames.map(
                                        (n) =>
                                          sql`${junctionAlias}.${sql.identifier(
                                            n
                                          )}`
                                      ),
                                      ", "
                                    )})`;
                                    const rightTableColumns = sql`(${sql.join(
                                      rightTableColumnNames.map(
                                        (n) =>
                                          sql`${$rights.alias}.${sql.identifier(
                                            n
                                          )}`
                                      ),
                                      ", "
                                    )})`;
                                    const junctionSubquery = sql.indent`select ${rightJunctionColumns}
from ${junctionSource} ${junctionAlias}
where ${sql.join(leftConditions, "\nand ")}`;

                                    $rights.where(
                                      sql`${rightTableColumns} in (${junctionSubquery})`
                                    );

                                    return $rights;
                                  },
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
