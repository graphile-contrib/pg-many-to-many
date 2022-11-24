import { PgSelectSingleStep } from "@dataplan/pg";
import { PgSource } from "@dataplan/pg";
import { EdgeStep, connection } from "grafast";
import type {} from "graphile-config";
import { GraphQLObjectType } from "graphql";
import type {} from "postgraphile";
import { junctionSymbol } from "./PgManyToManyRelationPlugin";

const version = require("../../package.json").version;

declare global {
  namespace GraphileBuild {
    interface ScopeObjectFieldsField {
      isPgManyToManyRelationEdgeTableField?: boolean;
      pgManyToManyJunctionTable?: PgSource<any, any, any, any>;
    }
  }
}

export const PgManyToManyRelationEdgeTablePlugin: GraphileConfig.Plugin = {
  name: "PgManyToManyRelationEdgeTablePlugin",
  description: `\
When a many-to-many relationship can be satisfied over multiple records (i.e.
the join is not unique, there can be multiple records in the junction table
that join the same left table and right table records), this plugin adds a
field to the edges where all of the join records can be traversed.`,
  version,

  schema: {
    hooks: {
      GraphQLObjectType_fields(fields, build, context) {
        const {
          extend,
          getTypeByName,
          graphql: { GraphQLNonNull, GraphQLList },
          inflection,
          sql,
        } = build;
        const {
          scope: { isPgManyToManyEdgeType, pgManyToManyRelationship },
          fieldWithHooks,
          Self,
        } = context;
        if (!isPgManyToManyEdgeType || !pgManyToManyRelationship) {
          return fields;
        }

        const {
          leftTable,
          leftRelationName,
          rightTable,
          rightRelationName,
          junctionTable,
          allowsMultipleEdgesToNode,
        } = pgManyToManyRelationship;

        if (!allowsMultipleEdgesToNode) {
          return fields;
        }

        const leftColumns =
          leftTable.getRelation(leftRelationName).remoteColumns;
        const leftColumnCodecs = leftColumns.map(
          (colName) => junctionTable.codec.columns[colName].codec
        );
        const rightColumns =
          junctionTable.getRelation(rightRelationName).localColumns;
        const rightRemoteColumns =
          junctionTable.getRelation(rightRelationName).remoteColumns;

        const JunctionTableType = build.getGraphQLTypeByPgCodec(
          junctionTable.codec,
          "output"
        ) as GraphQLObjectType | null;
        if (!JunctionTableType) {
          throw new Error(
            `Could not determine output type for ${junctionTable.name}`
          );
        }
        const JunctionTableConnectionType = getTypeByName(
          inflection.tableConnectionType(junctionTable.codec)
        ) as GraphQLObjectType | null;

        const relationDetails: GraphileBuild.PgRelationsPluginRelationDetails =
          {
            source: leftTable,
            codec: leftTable.codec,
            identifier: leftRelationName,
            relation: leftTable.getRelation(leftRelationName),
          };
        // TODO: these are almost certainly not the right names
        const connectionFieldName =
          build.inflection.manyRelationConnection(relationDetails);
        const listFieldName =
          build.inflection.manyRelationList(relationDetails);

        function makeFields(isConnection: boolean) {
          const fieldName = isConnection ? connectionFieldName : listFieldName;
          const Type = isConnection
            ? JunctionTableConnectionType
            : JunctionTableType;
          if (!Type) {
            return;
          }

          fields = extend(
            fields,
            {
              [fieldName]: fieldWithHooks(
                {
                  fieldName,
                  isPgFieldConnection: isConnection,
                  isPgFieldSimpleCollection: !isConnection,
                  isPgManyToManyRelationEdgeTableField: true,
                  pgManyToManyJunctionTable: junctionTable,
                },
                () => ({
                  description: `Reads and enables pagination through a set of \`${
                    JunctionTableType!.name
                  }\`.`,
                  type: isConnection
                    ? new GraphQLNonNull(JunctionTableConnectionType!)
                    : new GraphQLNonNull(
                        new GraphQLList(new GraphQLNonNull(JunctionTableType!))
                      ),
                  args: {},
                  plan(
                    $edge: EdgeStep<
                      any,
                      any,
                      any,
                      PgSelectSingleStep<any, any, any, any>
                    >
                  ) {
                    const $right = $edge.node();

                    // Create a spec that all entries in the collection must
                    // match
                    const spec = Object.create(null);

                    // Add left columns to spec
                    for (let i = 0, l = leftColumns.length; i < l; i++) {
                      const junctionColumnName = leftColumns[i];
                      const junctionColumnCodec = leftColumnCodecs[i];
                      spec[junctionColumnName] = $right.select(
                        sql`${sql.identifier(junctionSymbol)}.${sql.identifier(
                          junctionColumnName
                        )}`,
                        junctionColumnCodec
                      );
                    }

                    // Add right columns to spec
                    for (let i = 0, l = rightColumns.length; i < l; i++) {
                      const junctionColumnName = rightColumns[i];
                      const rightColumnName = rightRemoteColumns[i];
                      spec[junctionColumnName] = $right.get(rightColumnName);
                    }

                    // These are the equivalent junction records for this entry
                    const $junctions = junctionTable.find(spec);

                    return isConnection
                      ? (connection($junctions) as any)
                      : $junctions;
                  },
                })
              ),
            },

            `Many-to-many relation edge table (${
              isConnection ? "connection" : "simple collection"
            }) on ${Self.name} type for ${rightRelationName}.`
          );
        }
        const behavior = build.pgGetBehavior([
          junctionTable.getRelation(rightRelationName).extensions,
          junctionTable.extensions,
        ]);
        if (
          build.behavior.matches(behavior, "connection", "connection -list")
        ) {
          makeFields(true);
        }
        if (build.behavior.matches(behavior, "list", "connection -list")) {
          makeFields(false);
        }
        return fields;
      },
    },
  },
};
