module.exports = function PgManyToManyEdgeColumnsPlugin(builder) {
  builder.hook("GraphQLObjectType:fields", (fields, build, context) => {
    const {
      extend,
      pgGetGqlTypeByTypeIdAndModifier,
      pgSql: sql,
      pg2gql,
      graphql: { GraphQLString, GraphQLNonNull },
      pgColumnFilter,
      inflection,
      pgOmit: omit,
      pgGetSelectValueForFieldAndTypeAndModifier: getSelectValueForFieldAndTypeAndModifier,
      describePgEntity,
      sqlCommentByAddingTags,
    } = build;
    const {
      scope: { isPgManyToManyRowEdgeType, pgIntrospection: table },
      fieldWithHooks,
    } = context;

    if (!isPgManyToManyRowEdgeType || !table || table.kind !== "class") {
      return fields;
    }

    const nullableIf = (GraphQLNonNull, condition, Type) =>
      condition ? Type : new GraphQLNonNull(Type);

    return extend(
      fields,
      table.attributes.reduce((memo, attr) => {
        // FIXME: Filter out the key columns used to create the edge (person_id, team_id)

        // PERFORMANCE: These used to be .filter(...) calls
        if (!pgColumnFilter(attr, build, context)) return memo;
        if (omit(attr, "read")) return memo;

        const fieldName = inflection.column(attr);
        if (memo[fieldName]) {
          throw new Error(
            `Two columns produce the same GraphQL field name '${fieldName}' on class '${
              table.namespaceName
            }.${table.name}'; one of them is '${attr.name}'`
          );
        }
        memo = extend(
          memo,
          {
            [fieldName]: fieldWithHooks(
              fieldName,
              fieldContext => {
                const { addDataGenerator } = fieldContext;
                const ReturnType =
                  pgGetGqlTypeByTypeIdAndModifier(
                    attr.typeId,
                    attr.typeModifier
                  ) || GraphQLString;
                addDataGenerator(parsedResolveInfoFragment => {
                  return {
                    pgQuery: queryBuilder => {
                      queryBuilder.select(
                        getSelectValueForFieldAndTypeAndModifier(
                          ReturnType,
                          fieldContext,
                          parsedResolveInfoFragment,
                          sql.fragment`(${queryBuilder.getTableAlias()}.${sql.identifier(
                            attr.name
                          )})`, // The brackets are necessary to stop the parser getting confused, ref: https://www.postgresql.org/docs/9.6/static/rowtypes.html#ROWTYPES-ACCESSING
                          attr.type,
                          attr.typeModifier
                        ),
                        fieldName
                      );
                    },
                  };
                });
                return {
                  description: attr.description,
                  type: nullableIf(
                    GraphQLNonNull,
                    !attr.isNotNull && !attr.type.domainIsNotNull,
                    ReturnType
                  ),
                  resolve: (data, _args, _context, _resolveInfo) => {
                    return pg2gql(data[fieldName], attr.type);
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
      }, {}),
      `Adding columns to '${describePgEntity(table)}'`
    );
  });
};
