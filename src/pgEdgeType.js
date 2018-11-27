module.exports = function pgEdgeType(
  build,
  edgeTypeName,
  source,
  NodeType,
  isNodeNullable,
  pgQuery,
  resolveNode,
  scope
) {
  const {
    newWithHooks,
    getTypeByName,
    graphql: { GraphQLObjectType, GraphQLNonNull },
    describePgEntity,
    sqlCommentByAddingTags,
    pgField,
  } = build;
  const base64 = str => Buffer.from(String(str)).toString("base64");
  const nullableIf = (condition, Type) =>
    condition ? Type : new GraphQLNonNull(Type);
  const Cursor = getTypeByName("Cursor");
  return newWithHooks(
    GraphQLObjectType,
    {
      name: edgeTypeName,
      description: `A \`${NodeType.name}\` edge in the connection.`,
      fields: ({ fieldWithHooks }) => {
        return {
          cursor: fieldWithHooks(
            "cursor",
            ({ addDataGenerator }) => {
              addDataGenerator(() => ({
                usesCursor: [true],
                ...(pgQuery ? { pgQuery } : null),
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
              description: `The \`${NodeType.name}\` at the end of the edge.`,
              type: nullableIf(isNodeNullable, NodeType),
              resolve: resolveNode,
            },
            {},
            false
          ),
        };
      },
    },
    {
      __origin: `Adding ${
        source.kind === "class" ? "table" : "function result"
      } edge type for ${describePgEntity(source)}. You can rename the ${
        source.kind === "class" ? "table" : "function"
      }'s GraphQL ${
        source.kind === "class" ? "table" : "field (and its dependent types)"
      } via:\n\n  ${sqlCommentByAddingTags(source, {
        name: "newNameHere",
      })}`,
      isEdgeType: true,
      nodeType: NodeType,
      pgIntrospection: source,
      ...scope,
    }
  );
};
