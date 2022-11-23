import { PgTableSource } from "./interfaces";
import { PgSelectSingleStep, PgSource } from "@dataplan/pg";
import { PgManyToManyRelationDetails } from "./PgManyToManyRelationInflectionPlugin";
import { ConnectionStep, each, EdgeStep, ExecutableStep } from "grafast";
import { GraphQLObjectType, GraphQLOutputType } from "graphql";

declare global {
  namespace GraphileBuild {
    interface ScopeObject {
      isPgManyToManyEdgeType?: boolean;
      pgManyToManyRelationship?: PgManyToManyRelationDetails;
    }
  }
}

const base64 = (str: string) => Buffer.from(String(str)).toString("base64");

export default function createManyToManyConnectionType(
  relationship: PgManyToManyRelationDetails,
  build: GraphileBuild.Build,
  leftTable: PgTableSource
) {
  const { leftRelationName, junctionTable, rightRelationName, rightTable } =
    relationship;
  const {
    inflection,
    graphql: { GraphQLObjectType, GraphQLNonNull, GraphQLList },
    getTypeByName,
    options: { pgForbidSetofFunctionsToReturnNull = false },
    nullableIf,
  } = build;

  const leftTableTypeName = inflection.tableType(leftTable.codec);
  if (!leftTableTypeName) {
    throw new Error(
      `Could not determine type name for table '${leftTable.name}'`
    );
  }

  const TableTypeName = inflection.tableType(rightTable.codec);
  if (!TableTypeName) {
    throw new Error(
      `Could not determine type name for table '${rightTable.name}'`
    );
  }

  const junctionTypeName = inflection.tableType(junctionTable.codec);

  const inflectorInfo = {
    ...relationship,
    leftTableTypeName,
  };

  const edgeTypeName = inflection.manyToManyRelationEdge(inflectorInfo);
  build.registerObjectType(
    edgeTypeName,
    {
      __origin: `Adding many-to-many edge type from ${leftTable.name} to ${rightTable.name} via ${junctionTable.name}.`,
      isConnectionEdgeType: true,
      // isPgRowEdgeType: true,
      isPgManyToManyEdgeType: true,
      // nodeType: TableType,
      pgManyToManyRelationship: relationship,
    },
    ExecutableStep as any,
    () => ({
      description: `A \`${TableTypeName}\` edge in the connection, with data from \`${junctionTypeName}\`.`,
      fields: ({ fieldWithHooks }) => {
        return {
          cursor: fieldWithHooks(
            {
              fieldName: "cursor",
              isCursorField: true,
            },
            () => ({
              description: "A cursor for use in pagination.",
              type: getTypeByName(
                inflection.builtin("Cursor")
              ) as GraphQLOutputType,
              plan($edge: EdgeStep<any, any, any, any>) {
                return $edge.cursor();
              },
            })
          ),
          node: fieldWithHooks(
            {
              fieldName: "node",
            },
            () => ({
              description: `The \`${TableTypeName}\` at the end of the edge.`,
              type: nullableIf(
                !pgForbidSetofFunctionsToReturnNull,
                getTypeByName(TableTypeName) as GraphQLObjectType
              ),
              plan(
                $edge: EdgeStep<
                  any,
                  any,
                  any,
                  PgSelectSingleStep<any, any, any>
                >
              ) {
                const $junction = $edge.node();
                const $right = $junction.singleRelation(rightRelationName);
                return $right;
              },
            })
          ),
        };
      },
    }),
    `PgManyToMany edge type for ${leftTable.name}-${junctionTable.name}-${rightTable.name}`
  );
  const connectionTypeName =
    inflection.manyToManyRelationConnection(inflectorInfo);

  build.registerObjectType(
    connectionTypeName,
    {
      isConnectionType: true,
      // isPgRowConnectionType: true,
      // edgeType: EdgeType,
      // nodeType: TableType,
      // pgIntrospection: rightTable,
    },
    ExecutableStep as any,
    () => ({
      description: `A connection to a list of \`${TableTypeName}\` values, with data from \`${junctionTypeName}\`.`,
      fields: ({ fieldWithHooks }) => {
        const PageInfo = getTypeByName(inflection.builtin("PageInfo")) as
          | GraphQLObjectType
          | undefined;
        return {
          nodes: fieldWithHooks(
            {
              fieldName: "nodes",
            },
            () => ({
              description: `A list of \`${TableTypeName}\` objects.`,
              type: new GraphQLNonNull(
                new GraphQLList(
                  nullableIf(
                    !pgForbidSetofFunctionsToReturnNull,
                    getTypeByName(TableTypeName) as GraphQLObjectType
                  )
                )
              ),
              plan($connection: ConnectionStep<any, any, any, any>) {
                const $junctions = $connection.nodes();
                return each($junctions, ($junction) => {
                  const $right = $junction.singleRelation(rightRelationName);
                  return $right;
                }) as any;
              },
            })
          ),
          edges: fieldWithHooks(
            {
              fieldName: "edges",
            },
            () => ({
              description: `A list of edges which contains the \`${TableTypeName}\`, info from the \`${junctionTypeName}\`, and the cursor to aid in pagination.`,
              type: new GraphQLNonNull(
                new GraphQLList(
                  new GraphQLNonNull(
                    getTypeByName(edgeTypeName) as GraphQLObjectType
                  )
                )
              ),
              plan($connection: ConnectionStep<any, any, any, any>) {
                return $connection.edges();
              },
            })
          ),
          ...(PageInfo
            ? {
                pageInfo: fieldWithHooks({ fieldName: "pageInfo" }, () => ({
                  description: "Information to aid in pagination.",
                  type: new GraphQLNonNull(PageInfo),
                  plan($connection: ConnectionStep<any, any, any, any>) {
                    return $connection.pageInfo() as any;
                  },
                })),
              }
            : null),
        };
      },
    }),
    `Adding many-to-many connection type from ${leftTable.name} to ${rightTable.name} via ${junctionTable.name}.`
  );
}
