import type {} from "graphile-config";
import type {} from "postgraphile";
import { PgManyToManyRelationDetails } from "./interfaces";

const version = require("../package.json").version;

const processDetails = (details: PgManyToManyRelationDetails) => {
  const {
    leftTable,
    leftRelationName,
    junctionTable,
    rightRelationName,
    // rightTable,
  } = details;
  const junctionRightRelation = junctionTable.getRelation(rightRelationName);
  const columnInflectionDataFromJunction = (columnName: string) => {
    return {
      columnName,
      codec: junctionTable.codec,
    };
  };
  const junctionLeftKeyAttributes = leftTable
    .getRelation(leftRelationName)
    .remoteColumns.map(columnInflectionDataFromJunction);
  const junctionRightKeyAttributes = junctionTable
    .getRelation(rightRelationName)
    .localColumns.map(columnInflectionDataFromJunction);
  return {
    ...details,
    junctionRightRelation,
    junctionLeftKeyAttributes,
    junctionRightKeyAttributes,
  };
};

export const PgManyToManyRelationInflectionPlugin: GraphileConfig.Plugin = {
  name: "PgManyToManyRelationInflectionPlugin",
  version,

  inflection: {
    add: {
      manyToManyRelationByKeys(_preset, details) {
        const {
          junctionRightKeyAttributes,
          junctionLeftKeyAttributes,
          junctionRightRelation,
          rightTable,
          junctionTable,
        } = processDetails(details);
        if (
          typeof junctionRightRelation.extensions?.tags.manyToManyFieldName ===
          "string"
        ) {
          return junctionRightRelation.extensions.tags.manyToManyFieldName;
        }
        return this.camelCase(
          `${this.pluralize(
            this._singularizedCodecName(rightTable.codec)
          )}-by-${this._singularizedCodecName(junctionTable.codec)}-${[
            ...junctionLeftKeyAttributes,
            ...junctionRightKeyAttributes,
          ]
            .map((attr) => this.column(attr))
            .join("-and-")}`
        );
      },
      manyToManyRelationByKeysSimple(_preset, details) {
        const {
          junctionRightKeyAttributes,
          junctionLeftKeyAttributes,
          junctionRightRelation,
          rightTable,
          junctionTable,
        } = processDetails(details);
        if (
          typeof junctionRightRelation.extensions?.tags
            .manyToManySimpleFieldName === "string"
        ) {
          return junctionRightRelation.extensions?.tags
            .manyToManySimpleFieldName;
        }
        return this.camelCase(
          `${this.pluralize(
            this._singularizedCodecName(rightTable.codec)
          )}-by-${this._singularizedCodecName(junctionTable.codec)}-${[
            ...junctionLeftKeyAttributes,
            ...junctionRightKeyAttributes,
          ]
            .map((attr) => this.column(attr))
            .join("-and-")}-list`
        );
      },
      manyToManyRelationEdge(_preset, details) {
        const relationName = this.manyToManyRelationByKeys(details);
        return this.upperCamelCase(
          `${details.leftTableTypeName}-${relationName}-many-to-many-edge`
        );
      },
      manyToManyRelationConnection(_preset, details) {
        const relationName = this.manyToManyRelationByKeys(details);
        return this.upperCamelCase(
          `${details.leftTableTypeName}-${relationName}-many-to-many-connection`
        );
      },
      /* eslint-disable no-unused-vars */
      manyToManyRelationSubqueryName(_preset, details) {
        /* eslint-enable no-unused-vars */
        return `many-to-many-subquery-by-${this._singularizedCodecName(
          details.junctionTable.codec
        )}`;
      },
    },
  },
};
