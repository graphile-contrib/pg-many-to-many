function createJunctionConditionType(
  build,
  context,
  combineJunctionWithRightTable = false,
  leftKeyAttributes,
  junctionLeftKeyAttributes,
  junctionRightKeyAttributes,
  rightKeyAttributes,
  junctionTable,
  rightTable,
  junctionLeftConstraint,
  junctionRightConstraint,
  leftTableType
) {
  const {
    newWithHooks,
    graphql: { GraphQLInputObjectType, GraphQLString },
    pgGetGqlInputTypeByTypeIdAndModifier,
    pgColumnFilter,
    inflection,
    extend,
    pgOmit: omit,
    describePgEntity,
  } = build;
  const junctionKeyAttributeNums = [
    ...junctionLeftKeyAttributes.map(attr => attr.num),
    ...junctionRightKeyAttributes.map(attr => attr.num),
  ];
  const relevantAttributes = junctionTable.attributes
    .filter(
      attr =>
        !junctionKeyAttributeNums.includes(attr.num) &&
        pgColumnFilter(attr, build, context) &&
        !omit(attr, "filter")
    )
    .map(attr => ({ attr, onJunction: true }));
  if (combineJunctionWithRightTable) {
    const rightKeyAttributeNums = rightKeyAttributes.map(attr => attr.num);
    const rightFilterableAttributes = rightTable.attributes
      .filter(
        attr =>
          !rightKeyAttributeNums.includes(attr.num) &&
          pgColumnFilter(attr, build, context) &&
          !omit(attr, "filter")
      )
      .map(attr => ({ attr, onJunction: false }));
    relevantAttributes.push(...rightFilterableAttributes);
  }

  const junctionTableTypeName = inflection.tableType(junctionTable);
  const rightTableTypeName = inflection.tableType(rightTable);

  return newWithHooks(
    GraphQLInputObjectType,
    {
      description: `A condition to be used against \`${rightTableTypeName}\` object types. All fields are tested for equality and combined with a logical ‘and.’`,
      name: inflection.manyToManyRelationConditionType(
        leftKeyAttributes,
        junctionLeftKeyAttributes,
        junctionRightKeyAttributes,
        rightKeyAttributes,
        junctionTable,
        rightTable,
        junctionLeftConstraint,
        junctionRightConstraint,
        leftTableType.name
      ),
      fields: context => {
        const { fieldWithHooks } = context;
        return relevantAttributes.reduce((memo, { attr, onJunction }) => {
          const fieldName = inflection.column(attr);
          const objectTypeName = onJunction
            ? junctionTableTypeName
            : rightTableTypeName;
          memo = extend(
            memo,
            {
              [fieldName]: fieldWithHooks(
                fieldName,
                {
                  description: `Checks for equality with the \`${objectTypeName}\` object’s \`${fieldName}\` field.`,
                  type:
                    pgGetGqlInputTypeByTypeIdAndModifier(
                      attr.typeId,
                      attr.typeModifier
                    ) || GraphQLString,
                },
                {
                  isPgConnectionConditionInputField: true,
                }
              ),
            },
            `Adding condition argument for ${describePgEntity(attr)}`
          );
          return memo;
        }, {});
      },
    },
    {
      isPgCondition: true,
    }
  );
}

module.exports = function PgManyToManyRelationFilterPlugin(builder) {
  builder.hook(
    "GraphQLObjectType:fields:field:args",
    (args, build, context) => {
      const {
        pgSql: sql,
        gql2pg,
        extend,
        pgColumnFilter,
        inflection,
        pgOmit: omit,
      } = build;
      const {
        scope: {
          fieldName,
          isPgManyToManyRelationField,
          isPgFieldConnection,
          pgManyToManyLeftKeyAttributes: leftKeyAttributes,
          pgManyToManyJunctionLeftKeyAttributes: junctionLeftKeyAttributes,
          pgManyToManyJunctionRightKeyAttributes: junctionRightKeyAttributes,
          pgManyToManyRightKeyAttributes: rightKeyAttributes,
          pgManyToManyJunctionTable: junctionTable,
          pgManyToManyRightTable: rightTable,
          pgManyToManyJunctionLeftConstraint: junctionLeftConstraint,
          pgManyToManyJunctionRightConstraint: junctionRightConstraint,
        },
        addArgDataGenerator,
        Self,
      } = context;
      if (!isPgManyToManyRelationField || !isPgFieldConnection) {
        return args;
      }
      const junctionKeyAttributeNums = [
        ...junctionLeftKeyAttributes.map(attr => attr.num),
        ...junctionRightKeyAttributes.map(attr => attr.num),
      ];
      const junctionFilterableAttributes = junctionTable.attributes.filter(
        attr =>
          !junctionKeyAttributeNums.includes(attr.num) &&
          pgColumnFilter(attr, build, context) &&
          !omit(attr, "filter")
      );
      if (junctionFilterableAttributes.length === 0) {
        return args;
      }

      const shouldCombineConditions = !!junctionLeftConstraint.tags
        .manyToManyCombinedConditionArg;

      const JunctionConditionType = createJunctionConditionType(
        build,
        context,
        shouldCombineConditions,
        leftKeyAttributes,
        junctionLeftKeyAttributes,
        junctionRightKeyAttributes,
        rightKeyAttributes,
        junctionTable,
        rightTable,
        junctionLeftConstraint,
        junctionRightConstraint,
        Self
      );

      addArgDataGenerator(function connectionConditionJunction({ condition }) {
        return {
          pgQuery: queryBuilder => {
            if (condition != null) {
              const subqueryName = inflection.manyToManyRelationSubqueryName(
                leftKeyAttributes,
                junctionLeftKeyAttributes,
                junctionRightKeyAttributes,
                rightKeyAttributes,
                junctionTable,
                rightTable,
                junctionLeftConstraint,
                junctionRightConstraint
              );
              const subQueryBuilder = queryBuilder.getNamedChild(subqueryName);
              if (!subQueryBuilder) {
                throw new Error(
                  `Could not find child query builder named ${subqueryName}`
                );
              }
              junctionFilterableAttributes.forEach(attr => {
                const fieldName = inflection.column(attr);
                const val = condition[fieldName];
                if (val != null) {
                  subQueryBuilder.addLiveCondition(() => record =>
                    record[attr.name] === val
                  );
                  subQueryBuilder.where(
                    sql.fragment`${subQueryBuilder.getTableAlias()}.${sql.identifier(
                      attr.name
                    )} = ${gql2pg(val, attr.type, attr.typeModifier)}`
                  );
                } else if (val === null) {
                  subQueryBuilder.addLiveCondition(() => record =>
                    record[attr.name] == null
                  );
                  subQueryBuilder.where(
                    sql.fragment`${subQueryBuilder.getTableAlias()}.${sql.identifier(
                      attr.name
                    )} IS NULL`
                  );
                }
              });
            }
          },
        };
      });

      const argName = shouldCombineConditions
        ? "condition"
        : "junctionCondition";
      if (shouldCombineConditions) {
        delete args.condition;
      }
      return extend(
        args,
        {
          [argName]: {
            description:
              "A condition to be used in determining which values should be returned by the collection.",
            type: JunctionConditionType,
          },
        },
        `Adding junction condition to connection field '${fieldName}' of '${Self.name}'`
      );
    }
  );
};
