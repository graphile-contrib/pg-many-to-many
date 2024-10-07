import type { PgResource, PgSelectSingleStep } from "@dataplan/pg";
import type {} from "graphile-config";
import type { GraphQLObjectType } from "graphql";
import type {} from "postgraphile";
import createManyToManyConnectionType from "./createManyToManyConnectionType";
import manyToManyRelationships from "./manyToManyRelationships";
import { PgManyToManyRelationDetails, PgTableResource } from ".";
import type { SQL } from "pg-sql2";

const version = require("../package.json").version;

export const junctionSymbol = Symbol("junction");

declare global {
  namespace GraphileBuild {
    interface BehaviorStrings {
      manyToMany: true;
    }
    interface BehaviorEntities {
      pgManyToMany: PgManyToManyRelationDetails;
    }
    interface Build {
      pgManyToManyRealtionshipsByResource: Map<
        PgTableResource,
        PgManyToManyRelationDetails[]
      >;
    }
  }
}

function isPgTableResource(r: PgResource): r is PgTableResource {
  return !!r.codec.attributes && !r.parameters;
}

export const PgManyToManyRelationPlugin: GraphileConfig.Plugin = {
  name: "PgManyToManyRelationPlugin",
  version,

  schema: {
    behaviorRegistry: {
      add: {
        manyToMany: {
          description:
            "Should this table/relation expose a many-to-many relationship via GraphQL",
          entities: ["pgResource", "pgCodecRelation", "pgManyToMany"],
        },
        connection: {
          description:
            "Should we use a connection to represent this many-to-many relationship",
          entities: ["pgManyToMany"],
        },
        list: {
          description:
            "Should we use a list to represent this many-to-many relationship",
          entities: ["pgManyToMany"],
        },
      },
    },
    entityBehavior: {
      pgResource: ["manyToMany", "select"],
      pgCodecRelation: ["manyToMany", "select"],
      pgManyToMany: {
        override(behavior, relation, build) {
          const { junctionTable, rightTable, rightRelationName } = relation;
          const overrides = build.pgGetBehavior([
            junctionTable.extensions,
            junctionTable.getRelation(rightRelationName).extensions,
            rightTable.extensions,
          ]);
          return ["manyToMany", "connection", "-list", behavior, overrides];
        },
      },
    },

    hooks: {
      build(build) {
        build.pgManyToManyRealtionshipsByResource = new Map();
        return build;
      },

      init(_, build, _context) {
        for (const leftTable of Object.values(
          build.input.pgRegistry.pgResources
        )) {
          if (!isPgTableResource(leftTable)) {
            continue;
          }
          const relationships = manyToManyRelationships(leftTable, build);
          build.pgManyToManyRealtionshipsByResource.set(
            leftTable,
            relationships
          );
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
          grafast: { connection },
          inflection,
        } = build;
        const {
          scope: { isPgClassType, pgCodec: leftTableCodec },
          fieldWithHooks,
          Self,
        } = context;
        if (!isPgClassType || !leftTableCodec || !leftTableCodec.attributes) {
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

        const relationships =
          build.pgManyToManyRealtionshipsByResource.get(leftTable);
        if (!relationships || relationships.length === 0) {
          return fields;
        }
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
                if (typeof leftRelation.remoteResource.from === "function") {
                  throw new Error(
                    `Function resource not supported for relation`
                  );
                }
                const junctionFrom = leftRelation.remoteResource.from;
                const leftTableAttributeNames = leftRelation.localAttributes;
                const leftJunctionAttributeNames =
                  leftRelation.remoteAttributes;
                const rightRelation =
                  junctionTable.getRelation(rightRelationName);
                const rightJunctionAttributeNames =
                  rightRelation.localAttributes;
                const rightTableAttributeNames = rightRelation.remoteAttributes;
                const rightResource = rightRelation.remoteResource;
                const junctionAlias = sql.identifier(junctionSymbol);
                const leftAttributeCount = leftJunctionAttributeNames.length;
                const rightAttributeCount = rightJunctionAttributeNames.length;

                // TODO: throw an error if localAttributes or remoteAttributes involve
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
                            pgFieldResource: rightTable,
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
                                    for (
                                      let i = 0;
                                      i < leftAttributeCount;
                                      i++
                                    ) {
                                      leftConditions.push(
                                        sql`${junctionAlias}.${sql.identifier(
                                          leftJunctionAttributeNames[i]
                                        )} = ${$rights.placeholder(
                                          $left.get(leftTableAttributeNames[i])
                                        )}`
                                      );
                                    }

                                    const rightConditions: SQL[] = [];
                                    for (
                                      let i = 0;
                                      i < rightAttributeCount;
                                      i++
                                    ) {
                                      rightConditions.push(
                                        sql`${junctionAlias}.${sql.identifier(
                                          rightJunctionAttributeNames[i]
                                        )} = ${$rights.alias}.${sql.identifier(
                                          rightTableAttributeNames[i]
                                        )}`
                                      );
                                    }

                                    // Join to a distinct version of junction table
                                    const leftDistinctFrom = sql`(${sql.indent`select distinct ${sql.join(
                                      leftJunctionAttributeNames.map(
                                        (c) =>
                                          sql`${junctionAlias}.${sql.identifier(
                                            c
                                          )}`
                                      ),
                                      ", "
                                    )}, ${sql.join(
                                      rightJunctionAttributeNames.map(
                                        (c) =>
                                          sql`${junctionAlias}.${sql.identifier(
                                            c
                                          )}`
                                      ),
                                      ", "
                                    )}\n
from ${junctionFrom} ${junctionAlias}
where ${sql.join(leftConditions, "\nand ")}
`})`;
                                    $rights.join({
                                      type: "inner",
                                      conditions: rightConditions,
                                      alias: junctionAlias,
                                      from: leftDistinctFrom,
                                    });

                                    return connection($rights) as any;
                                  }
                                : isConnection
                                ? // Simple join strategy so we can grab attributes on the connection edges
                                  ($left: PgSelectSingleStep) => {
                                    const $rights = rightResource.find();

                                    const leftConditions: SQL[] = [];
                                    for (
                                      let i = 0;
                                      i < leftAttributeCount;
                                      i++
                                    ) {
                                      leftConditions.push(
                                        sql`${junctionAlias}.${sql.identifier(
                                          leftJunctionAttributeNames[i]
                                        )} = ${$rights.placeholder(
                                          $left.get(leftTableAttributeNames[i])
                                        )}`
                                      );
                                    }

                                    const rightConditions: SQL[] = [];
                                    for (
                                      let i = 0;
                                      i < rightAttributeCount;
                                      i++
                                    ) {
                                      rightConditions.push(
                                        sql`${junctionAlias}.${sql.identifier(
                                          rightJunctionAttributeNames[i]
                                        )} = ${$rights.alias}.${sql.identifier(
                                          rightTableAttributeNames[i]
                                        )}`
                                      );
                                    }

                                    // Join to junction table
                                    $rights.join({
                                      type: "inner",
                                      conditions: rightConditions,
                                      alias: junctionAlias,
                                      from: junctionFrom,
                                    });

                                    // Limit to only the junction entries that match $left
                                    for (const leftCondition of leftConditions) {
                                      $rights.where(leftCondition);
                                    }

                                    return connection($rights) as any;
                                  }
                                : // Subquery strategy - most efficient, but we cannot query attributes from the junction table
                                  ($left: PgSelectSingleStep) => {
                                    const $rights = rightResource.find();

                                    const leftConditions: SQL[] = [];
                                    for (
                                      let i = 0;
                                      i < leftAttributeCount;
                                      i++
                                    ) {
                                      leftConditions.push(
                                        sql`${junctionAlias}.${sql.identifier(
                                          leftJunctionAttributeNames[i]
                                        )} = ${$rights.placeholder(
                                          $left.get(leftTableAttributeNames[i])
                                        )}`
                                      );
                                    }

                                    const rightJunctionAttributes = sql`${sql.join(
                                      rightJunctionAttributeNames.map(
                                        (n) =>
                                          sql`${junctionAlias}.${sql.identifier(
                                            n
                                          )}`
                                      ),
                                      ", "
                                    )}`;
                                    const rightTableAttribute = sql`(${sql.join(
                                      rightTableAttributeNames.map(
                                        (n) =>
                                          sql`${$rights.alias}.${sql.identifier(
                                            n
                                          )}`
                                      ),
                                      ", "
                                    )})`;
                                    const junctionSubquery = sql.indent`select ${rightJunctionAttributes}
from ${junctionFrom} ${junctionAlias}
where ${sql.join(leftConditions, "\nand ")}`;

                                    $rights.where(
                                      sql`${rightTableAttribute} in (${junctionSubquery})`
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

                if (
                  build.behavior.pgManyToManyMatches(relationship, "manyToMany")
                ) {
                  if (
                    build.behavior.pgManyToManyMatches(
                      relationship,
                      "connection"
                    )
                  ) {
                    makeFields(true);
                  }
                  if (
                    build.behavior.pgManyToManyMatches(relationship, "list")
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
