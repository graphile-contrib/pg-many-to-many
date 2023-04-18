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
  const attributeInflectionDataFromJunction = (attributeName: string) => {
    return {
      attributeName,
      codec: junctionTable.codec,
    };
  };
  const junctionLeftKeyAttributes = leftTable
    .getRelation(leftRelationName)
    .remoteAttributes.map(attributeInflectionDataFromJunction);
  const junctionRightKeyAttributes = junctionTable
    .getRelation(rightRelationName)
    .localAttributes.map(attributeInflectionDataFromJunction);
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
      _manyToManyRelation(_preset, details) {
        const {
          junctionRightKeyAttributes,
          junctionLeftKeyAttributes,
          junctionRightRelation,
          rightTable,
          junctionTable,
        } = processDetails(details);
        const baseOverride =
          junctionRightRelation.extensions?.tags.manyToManyFieldName;
        if (typeof baseOverride === "string") {
          return baseOverride;
        }
        return this.camelCase(
          `${this.pluralize(
            this._singularizedCodecName(rightTable.codec)
          )}-by-${this._singularizedCodecName(junctionTable.codec)}-${[
            ...junctionLeftKeyAttributes,
            ...junctionRightKeyAttributes,
          ]
            .map((attr) => this.attribute(attr))
            .join("-and-")}`
        );
      },
      manyToManyRelationConnectionField(_preset, details) {
        const { junctionRightRelation } = processDetails(details);
        const override =
          junctionRightRelation.extensions?.tags.manyToManyConnectionFieldName;
        if (typeof override === "string") {
          return override;
        }
        return this.connectionField(this._manyToManyRelation(details));
      },
      manyToManyRelationListField(_preset, details) {
        const { junctionRightRelation } = processDetails(details);
        const override =
          junctionRightRelation.extensions?.tags.manyToManySimpleFieldName;
        if (typeof override === "string") {
          return override;
        }
        return this.listField(this._manyToManyRelation(details));
      },
      manyToManyRelationEdgeType(_preset, details) {
        const relationName = this._manyToManyRelation(details);
        return this.upperCamelCase(
          `${details.leftTableTypeName}-${relationName}-many-to-many-edge`
        );
      },
      manyToManyRelationConnectionType(_preset, details) {
        const relationName = this._manyToManyRelation(details);
        return this.upperCamelCase(
          `${details.leftTableTypeName}-${relationName}-many-to-many-connection`
        );
      },
    },
  },
};
