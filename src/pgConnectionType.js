module.exports = function pgConnectionType(
  build,
  connectionTypeName,
  source,
  NodeType,
  EdgeType,
  hasPageInfo,
  isNodeNullable,
  resolveNodes,
  resolveEdges,
  scope
) {
  const {
    newWithHooks,
    getTypeByName,
    graphql: { GraphQLObjectType, GraphQLNonNull, GraphQLList },
    describePgEntity,
    sqlCommentByAddingTags,
    pgField,
  } = build;
  const nullableIf = (condition, Type) =>
    condition ? Type : new GraphQLNonNull(Type);
  const PageInfo = getTypeByName("PageInfo");
  return newWithHooks(
    GraphQLObjectType,
    {
      name: connectionTypeName,
      description: `A connection to a list of \`${NodeType.name}\` values.`,
      fields: ({ recurseDataGeneratorsForField, fieldWithHooks }) => {
        if (hasPageInfo) {
          recurseDataGeneratorsForField("pageInfo", true);
        }
        return {
          nodes: pgField(
            build,
            fieldWithHooks,
            "nodes",
            {
              description: `A list of \`${NodeType.name}\` objects.`,
              type: new GraphQLNonNull(
                new GraphQLList(nullableIf(isNodeNullable, NodeType))
              ),
              resolve: resolveNodes,
            },
            {},
            false
          ),
          edges: pgField(
            build,
            fieldWithHooks,
            "edges",
            {
              description: `A list of edges which contains the \`${
                NodeType.name
              }\` and cursor to aid in pagination.`,
              type: new GraphQLNonNull(
                new GraphQLList(new GraphQLNonNull(EdgeType))
              ),
              resolve: resolveEdges,
            },
            {},
            false,
            {
              hoistCursor: true,
            }
          ),
          ...(hasPageInfo
            ? {
                pageInfo: {
                  description: "Information to aid in pagination.",
                  type: new GraphQLNonNull(PageInfo),
                  resolve(data) {
                    return data;
                  },
                },
              }
            : null),
        };
      },
    },
    {
      __origin: `Adding ${
        source.kind === "class" ? "table" : "function"
      } connection type for ${describePgEntity(source)}. You can rename the ${
        source.kind === "class" ? "table" : "function"
      }'s GraphQL ${
        source.kind === "class" ? "type" : "field (and its dependent types)"
      } via:\n\n  ${sqlCommentByAddingTags(source, {
        name: "newNameHere",
      })}`,
      isConnectionType: true,
      edgeType: EdgeType,
      nodeType: NodeType,
      pgIntrospection: source,
      ...scope,
    }
  );
};
