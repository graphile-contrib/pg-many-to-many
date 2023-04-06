import { PgSelectSingleStep } from "@dataplan/pg";
import { ConnectionStep, EdgeStep, ExecutableStep } from "grafast";
import { GraphQLObjectType, GraphQLOutputType } from "graphql";
import {
  PgTableResource,
  PgManyToManyRelationDetails,
  PgManyToManyRelationDetailsWithExtras,
} from "./interfaces.js";

export default function createManyToManyConnectionType(
  relationship: PgManyToManyRelationDetails,
  build: GraphileBuild.Build,
  leftTable: PgTableResource
) {
  const {
    // leftRelationName,
    junctionTable,
    // rightRelationName,
    rightTable,
    // allowsMultipleEdgesToNode,
  } = relationship;
  const {
    inflection,
    graphql: { GraphQLNonNull, GraphQLList },
    getTypeByName,
    options: { pgForbidSetofFunctionsToReturnNull = false },
    nullableIf,
  } = build;

  const leftTableTypeName = inflection.tableType(leftTable.codec);
  const junctionTypeName = inflection.tableType(junctionTable.codec);
  const rightTableTypeName = inflection.tableType(rightTable.codec);

  const inflectorInfo: PgManyToManyRelationDetailsWithExtras = {
    ...relationship,
    leftTableTypeName,
  };

  const edgeTypeName = inflection.manyToManyRelationEdgeType(inflectorInfo);
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
      description: `A \`${rightTableTypeName}\` edge in the connection, with data from \`${junctionTypeName}\`.`,
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
              description: `The \`${rightTableTypeName}\` at the end of the edge.`,
              type: nullableIf(
                !pgForbidSetofFunctionsToReturnNull,
                getTypeByName(rightTableTypeName) as GraphQLObjectType
              ),
              plan($edge: EdgeStep<any, any, any, PgSelectSingleStep>) {
                const $right = $edge.node();
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
    inflection.manyToManyRelationConnectionType(inflectorInfo);

  build.registerObjectType(
    connectionTypeName,
    {
      isConnectionType: true,
      isPgConnectionRelated: true,
      pgCodec: rightTable.codec,
      // isPgRowConnectionType: true,
      // edgeType: EdgeType,
      // nodeType: TableType,
      // pgIntrospection: rightTable,
    },
    ExecutableStep as any,
    () => ({
      description: `A connection to a list of \`${rightTableTypeName}\` values, with data from \`${junctionTypeName}\`.`,
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
              description: `A list of \`${rightTableTypeName}\` objects.`,
              type: new GraphQLNonNull(
                new GraphQLList(
                  nullableIf(
                    !pgForbidSetofFunctionsToReturnNull,
                    getTypeByName(rightTableTypeName) as GraphQLObjectType
                  )
                )
              ),
              plan($connection: ConnectionStep<any, any, any, any>) {
                return $connection.nodes();
              },
            })
          ),
          edges: fieldWithHooks(
            {
              fieldName: "edges",
            },
            () => ({
              description: `A list of edges which contains the \`${rightTableTypeName}\`, info from the \`${junctionTypeName}\`, and the cursor to aid in pagination.`,
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
