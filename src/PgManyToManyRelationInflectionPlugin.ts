import {
  PgSource,
  PgSourceRelation,
  PgTypeCodec,
  PgTypeColumn,
} from "@dataplan/pg";
import type {} from "graphile-config";
import type {} from "postgraphile";
import { PgTableSource } from "./interfaces";

const version = require("../package.json").version;

type InflectionColumn = {
  columnName: string;
  column: PgTypeColumn;
  codec: PgTypeCodec<any, any, any>;
};

export interface PgManyToManyRelationDetails {
  leftTable: PgTableSource;
  leftRelationName: string;
  junctionTable: PgTableSource;
  rightRelationName: string;
  rightTable: PgTableSource;
  allowsMultipleEdgesToNode: boolean;
}

export interface PgManyToManyRelationDetailsWithExtras
  extends PgManyToManyRelationDetails {
  leftTableTypeName: string;
}

declare global {
  namespace GraphileBuild {
    interface Inflection {
      manyToManyRelationByKeys(
        this: Inflection,
        details: PgManyToManyRelationDetails
      ): string;
      manyToManyRelationByKeysSimple(
        this: Inflection,
        details: PgManyToManyRelationDetails
      ): string;
      manyToManyRelationEdge(
        this: Inflection,
        details: PgManyToManyRelationDetailsWithExtras
      ): string;
      manyToManyRelationConnection(
        this: Inflection,
        details: PgManyToManyRelationDetailsWithExtras
      ): string;
      manyToManyRelationSubqueryName(
        this: Inflection,
        details: PgManyToManyRelationDetailsWithExtras
      ): string;
    }
  }
}

const processDetails = (details: PgManyToManyRelationDetails) => {
  const {
    leftTable,
    leftRelationName,
    junctionTable,
    rightRelationName,
    rightTable,
  } = details;
  const junctionRightRelation = junctionTable.getRelation(rightRelationName);
  const columnInflectionDataFromJunction = (columnName: string) => {
    const column = junctionTable.codec.columns[columnName];
    return {
      columnName,
      column,
      codec: column.codec,
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
      manyToManyRelationByKeys(preset, details) {
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
          return junctionRightRelation.extensions?.tags.manyToManyFieldName;
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
      manyToManyRelationByKeysSimple(preset, details) {
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
      manyToManyRelationEdge(preset, details) {
        const relationName = this.manyToManyRelationByKeys(details);
        return this.upperCamelCase(
          `${details.leftTableTypeName}-${relationName}-many-to-many-edge`
        );
      },
      manyToManyRelationConnection(preset, details) {
        const relationName = this.manyToManyRelationByKeys(details);
        return this.upperCamelCase(
          `${details.leftTableTypeName}-${relationName}-many-to-many-connection`
        );
      },
      /* eslint-disable no-unused-vars */
      manyToManyRelationSubqueryName(preset, details) {
        /* eslint-enable no-unused-vars */
        return `many-to-many-subquery-by-${this._singularizedCodecName(
          details.junctionTable.codec
        )}`;
      },
    },
  },
};
