import type { PgCodec, PgResource, PgSelectSingleStep } from "@dataplan/pg";
import type {} from "graphile-config";
import type { GraphQLObjectType } from "graphql";
import type { SQL } from "pg-sql2";
import type {} from "postgraphile";
import type { PgManyToManyRelationDetails, PgTableResource } from ".";
import createManyToManyConnectionType from "./createManyToManyConnectionType";
import manyToManyRelationships from "./manyToManyRelationships";
import { EXPORTABLE } from "graphile-build";

const version = require("../package.json").version;

export const junctionSymbolContainer = EXPORTABLE(
  () => ({ symbol: Symbol("junction") }),
  []
);

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

function isPgTableResource(resource: PgResource): resource is PgTableResource {
  return !!resource.codec.attributes && !resource.parameters;
}

function getPgTableResourceByCodec(
  build: GraphileBuild.Build,
  pgCodec: PgCodec
) {
  const pgTableResourceMatches = Object.values(
    build.input.pgRegistry.pgResources
  ).filter(
    (resource) => resource.codec === pgCodec && isPgTableResource(resource)
  ) as PgTableResource[];
  if (pgTableResourceMatches.length !== 1) {
    if (pgTableResourceMatches.length > 1) {
      throw new Error(
        `PgManyToMany: there are multiple parameterless sources for codec '${pgCodec.name}', we can't determine which one to use.`
      );
    }
    return null;
  }
  return pgTableResourceMatches[0];
}

function makeRelationPlan(
  build: GraphileBuild.Build,
  isConnection: boolean,
  allowsMultipleEdgesToNode: boolean,
  leftTable: PgTableResource,
  leftRelationName: string,
  junctionTable: PgTableResource,
  rightRelationName: string
) {
  const {
    sql,
    grafast: { connection },
  } = build;
  const leftRelation = leftTable.getRelation(leftRelationName);
  if (typeof leftRelation.remoteResource.from === "function") {
    throw new Error(`Function resource not supported for relation`);
  }
  const junctionFrom = leftRelation.remoteResource.from;
  const leftTableAttributeNames = leftRelation.localAttributes;
  const leftJunctionAttributeNames = leftRelation.remoteAttributes;
  const rightRelation = junctionTable.getRelation(rightRelationName);
  const rightJunctionAttributeNames = rightRelation.localAttributes;
  const rightTableAttributeNames = rightRelation.remoteAttributes;
  const rightResource = rightRelation.remoteResource;
  const junctionAlias = EXPORTABLE(
    (junctionSymbolContainer, sql) => ({
      alias: sql.identifier(junctionSymbolContainer.symbol),
    }),
    [junctionSymbolContainer, sql]
  );
  const leftAttributeCount = leftJunctionAttributeNames.length;
  const rightAttributeCount = rightJunctionAttributeNames.length;

  if (allowsMultipleEdgesToNode && isConnection) {
    // Distinct join strategy so we can determine the joined-on records for edges.
    return EXPORTABLE(
      (
        connection,
        junctionAlias,
        junctionFrom,
        leftAttributeCount,
        leftJunctionAttributeNames,
        leftTableAttributeNames,
        rightAttributeCount,
        rightJunctionAttributeNames,
        rightResource,
        rightTableAttributeNames,
        sql
      ) =>
        function plan($left: PgSelectSingleStep) {
          const $rights = rightResource.find();

          const leftConditions: SQL[] = [];
          for (let i = 0; i < leftAttributeCount; i++) {
            leftConditions.push(
              sql`${junctionAlias.alias}.${sql.identifier(
                leftJunctionAttributeNames[i]
              )} = ${$rights.placeholder(
                $left.get(leftTableAttributeNames[i])
              )}`
            );
          }

          const rightConditions: SQL[] = [];
          for (let i = 0; i < rightAttributeCount; i++) {
            rightConditions.push(
              sql`${junctionAlias.alias}.${sql.identifier(
                rightJunctionAttributeNames[i]
              )} = ${$rights.alias}.${sql.identifier(
                rightTableAttributeNames[i]
              )}`
            );
          }

          // Join to a distinct version of junction table
          const leftDistinctFrom = sql`(${sql.indent`select distinct ${sql.join(
            leftJunctionAttributeNames.map(
              (c) => sql`${junctionAlias.alias}.${sql.identifier(c)}`
            ),
            ", "
          )}, ${sql.join(
            rightJunctionAttributeNames.map(
              (c) => sql`${junctionAlias.alias}.${sql.identifier(c)}`
            ),
            ", "
          )}\n
from ${junctionFrom} ${junctionAlias.alias}
where ${sql.join(leftConditions, "\nand ")}
`})`;
          $rights.join({
            type: "inner",
            conditions: rightConditions,
            alias: junctionAlias.alias,
            from: leftDistinctFrom,
          });

          return connection($rights) as any;
        },
      [
        connection,
        junctionAlias,
        junctionFrom,
        leftAttributeCount,
        leftJunctionAttributeNames,
        leftTableAttributeNames,
        rightAttributeCount,
        rightJunctionAttributeNames,
        rightResource,
        rightTableAttributeNames,
        sql,
      ]
    );
  } else if (isConnection) {
    // Simple join strategy so we can grab attributes on the connection edges
    return EXPORTABLE(
      (
        connection,
        junctionAlias,
        junctionFrom,
        leftAttributeCount,
        leftJunctionAttributeNames,
        leftTableAttributeNames,
        rightAttributeCount,
        rightJunctionAttributeNames,
        rightResource,
        rightTableAttributeNames,
        sql
      ) =>
        function plan($left: PgSelectSingleStep) {
          const $rights = rightResource.find();

          const leftConditions: SQL[] = [];
          for (let i = 0; i < leftAttributeCount; i++) {
            leftConditions.push(
              sql`${junctionAlias.alias}.${sql.identifier(
                leftJunctionAttributeNames[i]
              )} = ${$rights.placeholder(
                $left.get(leftTableAttributeNames[i])
              )}`
            );
          }

          const rightConditions: SQL[] = [];
          for (let i = 0; i < rightAttributeCount; i++) {
            rightConditions.push(
              sql`${junctionAlias.alias}.${sql.identifier(
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
            alias: junctionAlias.alias,
            from: junctionFrom,
          });

          // Limit to only the junction entries that match $left
          for (const leftCondition of leftConditions) {
            $rights.where(leftCondition);
          }

          return connection($rights) as any;
        },
      [
        connection,
        junctionAlias,
        junctionFrom,
        leftAttributeCount,
        leftJunctionAttributeNames,
        leftTableAttributeNames,
        rightAttributeCount,
        rightJunctionAttributeNames,
        rightResource,
        rightTableAttributeNames,
        sql,
      ]
    );
  } else {
    // Subquery strategy - most efficient, but we cannot query attributes from the junction table
    return EXPORTABLE(
      (
        junctionAlias,
        junctionFrom,
        leftAttributeCount,
        leftJunctionAttributeNames,
        leftTableAttributeNames,
        rightJunctionAttributeNames,
        rightResource,
        rightTableAttributeNames,
        sql
      ) =>
        function plan($left: PgSelectSingleStep) {
          const $rights = rightResource.find();

          const leftConditions: SQL[] = [];
          for (let i = 0; i < leftAttributeCount; i++) {
            leftConditions.push(
              sql`${junctionAlias.alias}.${sql.identifier(
                leftJunctionAttributeNames[i]
              )} = ${$rights.placeholder(
                $left.get(leftTableAttributeNames[i])
              )}`
            );
          }

          const rightJunctionAttributes = sql`${sql.join(
            rightJunctionAttributeNames.map(
              (n) => sql`${junctionAlias.alias}.${sql.identifier(n)}`
            ),
            ", "
          )}`;
          const rightTableAttribute = sql`(${sql.join(
            rightTableAttributeNames.map(
              (n) => sql`${$rights.alias}.${sql.identifier(n)}`
            ),
            ", "
          )})`;
          const junctionSubquery = sql.indent`select ${rightJunctionAttributes}
from ${junctionFrom} ${junctionAlias.alias}
where ${sql.join(leftConditions, "\nand ")}`;

          $rights.where(sql`${rightTableAttribute} in (${junctionSubquery})`);

          return $rights;
        },
      [
        junctionAlias,
        junctionFrom,
        leftAttributeCount,
        leftJunctionAttributeNames,
        leftTableAttributeNames,
        rightJunctionAttributeNames,
        rightResource,
        rightTableAttributeNames,
        sql,
      ]
    );
  }
}

type FieldsContext =
  | GraphileBuild.ContextObjectFields
  | GraphileBuild.ContextInterfaceFields;

function isInterfaceContext(
  context: FieldsContext
): context is GraphileBuild.ContextInterfaceFields {
  return context.type === "GraphQLInterfaceType";
}

function extendFields(
  fields: GraphileBuild.GrafastFieldConfigMap<any, any>,
  build: GraphileBuild.Build,
  context: FieldsContext
) {
  const {
    extend,
    inflection,
    graphql: { GraphQLNonNull, GraphQLList },
  } = build;
  const {
    fieldWithHooks,
    scope: { pgCodec: leftTableCodec },
    Self,
  } = context;
  const isInterface = isInterfaceContext(context);
  if (!leftTableCodec) {
    return fields;
  }
  const leftTable = getPgTableResourceByCodec(build, leftTableCodec);
  if (!leftTable) {
    return fields;
  }

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
            throw new Error(`Function resource not supported for relation`);
          }

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
                      isPgManyToManyRelationField: isInterface
                        ? undefined
                        : true,
                      pgManyToManyRightTable: isInterface
                        ? undefined
                        : rightTable,
                    },
                    () => ({
                      description: `Reads and enables pagination through a set of \`${
                        RightTableType!.name
                      }\`.`,
                      type: isConnection
                        ? new GraphQLNonNull(RightTableConnectionType!)
                        : new GraphQLNonNull(
                            new GraphQLList(new GraphQLNonNull(RightTableType!))
                          ),
                      args: Object.create(null),
                      plan: isInterface
                        ? undefined
                        : makeRelationPlan(
                            build,
                            isConnection,
                            allowsMultipleEdgesToNode,
                            leftTable,
                            leftRelationName,
                            junctionTable,
                            rightRelationName
                          ),
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

          if (build.behavior.pgManyToManyMatches(relationship, "manyToMany")) {
            if (
              build.behavior.pgManyToManyMatches(relationship, "connection")
            ) {
              makeFields(true);
            }
            if (build.behavior.pgManyToManyMatches(relationship, "list")) {
              makeFields(false);
            }
          }
          return memo;
        }),
      Object.create(null)
    ),
    `Adding many-to-many relations for ${Self.name}`
  );
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
        inferred: {
          provides: ["default"],
          before: ["inferred"],
          callback(behavior) {
            return ["manyToMany", "connection", "list", behavior];
          },
        },
        override: {
          provides: ["default"],
          before: ["inferred", "override"],
          callback(behavior, relation, build) {
            const { junctionTable, rightTable, rightRelationName } = relation;
            // Import overrides from the tables and relation related to this many-many
            const overrides = build.pgGetBehavior([
              junctionTable.extensions,
              junctionTable.getRelation(rightRelationName).extensions,
              rightTable.extensions,
            ]);
            return [behavior, overrides];
          },
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
          scope: { isPgClassType },
        } = context;
        if (!isPgClassType) {
          return fields;
        }
        return extendFields(fields, build, context);
      },

      GraphQLInterfaceType_fields(fields, build, context) {
        const {
          scope: { isPgPolymorphicTableType },
        } = context;
        if (!isPgPolymorphicTableType) {
          return fields;
        }
        return extendFields(fields, build, context);
      },
    },
  },
};
