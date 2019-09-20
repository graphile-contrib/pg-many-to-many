module.exports = function PgManyToManyRelationEdgeColumnsPlugin(builder) {
  builder.hook(
    "GraphQLObjectType:fields",
    (fields, build, context) => {
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
      } = build;
      const {
        scope: { isPgManyToManyEdgeType, pgManyToManyRelationship },
        fieldWithHooks,
      } = context;
      const nullableIf = (condition, Type) =>
        condition ? Type : new GraphQLNonNull(Type);

      if (!isPgManyToManyEdgeType || !pgManyToManyRelationship) {
        return fields;
      }

      const {
        leftKeyAttributes,
        junctionTable,
        junctionLeftKeyAttributes,
        junctionRightKeyAttributes,
        rightKeyAttributes,
        allowsMultipleEdgesToNode,
      } = pgManyToManyRelationship;

      if (allowsMultipleEdgesToNode) {
        return fields;
      }

      return extend(
        fields,
        junctionTable.attributes.reduce((memo, attr) => {
          if (!pgColumnFilter(attr, build, context)) return memo;
          if (omit(attr, "read")) return memo;

          // Skip left and right key attributes
          if (junctionLeftKeyAttributes.map(a => a.name).includes(attr.name))
            return memo;
          if (junctionRightKeyAttributes.map(a => a.name).includes(attr.name))
            return memo;

          const fieldName = inflection.column(attr);
          if (memo[fieldName]) {
            throw new Error(
              `Two columns produce the same GraphQL field name '${fieldName}' on class '${
                junctionTable.namespaceName
              }.${junctionTable.name}'; one of them is '${attr.name}'`
            );
          }
          memo = extend(
            memo,
            {
              [fieldName]: fieldWithHooks(
                fieldName,
                fieldContext => {
                  const { type, typeModifier } = attr;
                  const { addDataGenerator } = fieldContext;
                  const ReturnType =
                    pgGetGqlTypeByTypeIdAndModifier(
                      attr.typeId,
                      attr.typeModifier
                    ) || GraphQLString;
                  addDataGenerator(parsedResolveInfoFragment => {
                    return {
                      pgQuery: queryBuilder => {
                        // Since we're ignoring multi-column keys, we can simplify here
                        const leftKeyAttribute = leftKeyAttributes[0];
                        const junctionLeftKeyAttribute =
                          junctionLeftKeyAttributes[0];
                        const junctionRightKeyAttribute =
                          junctionRightKeyAttributes[0];
                        const rightKeyAttribute = rightKeyAttributes[0];

                        queryBuilder.select(
                          getSelectValueForFieldAndTypeAndModifier(
                            ReturnType,
                            fieldContext,
                            parsedResolveInfoFragment,
                            sql.fragment`(select ${sql.identifier(
                              attr.name
                            )} from ${sql.identifier(
                              junctionTable.namespace.name,
                              junctionTable.name
                            )} where ${sql.identifier(
                              junctionRightKeyAttribute.name
                            )} = ${queryBuilder.getTableAlias()}.${sql.identifier(
                              rightKeyAttribute.name
                            )} and ${sql.identifier(
                              junctionLeftKeyAttribute.name
                            )} = ${queryBuilder.parentQueryBuilder.parentQueryBuilder.getTableAlias()}.${sql.identifier(
                              leftKeyAttribute.name
                            )})`,
                            type,
                            typeModifier
                          ),
                          fieldName
                        );
                      },
                    };
                  });
                  return {
                    description: attr.description,
                    type: nullableIf(
                      !attr.isNotNull &&
                        !attr.type.domainIsNotNull &&
                        !attr.tags.notNull,
                      ReturnType
                    ),
                    resolve: data => {
                      return pg2gql(data[fieldName], attr.type);
                    },
                  };
                },
                { pgFieldIntrospection: attr }
              ),
            },
            `Adding field for ${describePgEntity(attr)}.`
          );
          return memo;
        }, {}),
        `Adding columns to '${describePgEntity(junctionTable)}'`
      );
    },
    ["PgManyToManyRelationEdgeColumns"]
  );
};
