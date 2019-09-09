# @graphile-contrib/pg-many-to-many

[![Package on npm](https://img.shields.io/npm/v/@graphile-contrib/pg-many-to-many.svg)](https://www.npmjs.com/package/@graphile-contrib/pg-many-to-many) [![CircleCI](https://circleci.com/gh/graphile-contrib/pg-many-to-many.svg?style=svg)](https://circleci.com/gh/graphile-contrib/pg-many-to-many)

This Graphile Engine plugin adds connection fields for many-to-many relations.

> Requires `postgraphile@^4.3.1` or `graphile-build-pg@^4.3.1`

Example:

```graphql
{
  allPeople {
    nodes {
      personName
      # 👇 many-to-many relation
      teamsByTeamMemberPersonIdAndTeamId {
        nodes {
          teamName
        }
      }
    }
  }
}
```

## Usage

Append this plugin and the additional fields will be added to your schema.

### CLI

```bash
yarn add postgraphile
yarn add @graphile-contrib/pg-many-to-many
npx postgraphile --append-plugins @graphile-contrib/pg-many-to-many
```

### Library

```js
const express = require("express");
const { postgraphile } = require("postgraphile");
const PgManyToManyPlugin = require("@graphile-contrib/pg-many-to-many");

const app = express();

app.use(
  postgraphile(process.env.DATABASE_URL, "app_public", {
    appendPlugins: [PgManyToManyPlugin],
    graphiql: true,
  })
);

app.listen(5000);
```

## Inflection

To avoid naming conflicts, this plugin uses a verbose naming convention (e.g. `teamsByTeamMemberTeamId`), similar to how related fields are named by default in PostGraphile v4. You can override this by writing a custom inflector plugin or by using smart comments in your SQL schema.

### Inflector Plugin

Writing a custom inflector plugin gives you full control over the GraphQL field names. Here is an example plugin that shortens the field names to just the table name (producing e.g. `teams`):

> :warning: Warning: Simplifying the field names as shown below will lead to field name conflicts if your junction table has multiple foreign keys referencing the same table. You will need to customize the inflector function to resolve the conflicts.

```js
const { makeAddInflectorsPlugin } = require("graphile-utils");

module.exports = makeAddInflectorsPlugin(
  {
    manyToManyRelationByKeys(
      _leftKeyAttributes,
      _junctionLeftKeyAttributes,
      _junctionRightKeyAttributes,
      _rightKeyAttributes,
      _junctionTable,
      rightTable,
      _junctionLeftConstraint,
      junctionRightConstraint
    ) {
      if (junctionRightConstraint.tags.manyToManyFieldName) {
        return junctionRightConstraint.tags.manyToManyFieldName;
      }
      return this.camelCase(
        `${this.pluralize(this._singularizedTableName(rightTable))}`
      );
    },
    manyToManyRelationByKeysSimple(
      _leftKeyAttributes,
      _junctionLeftKeyAttributes,
      _junctionRightKeyAttributes,
      _rightKeyAttributes,
      _junctionTable,
      rightTable,
      _junctionLeftConstraint,
      junctionRightConstraint
    ) {
      if (junctionRightConstraint.tags.manyToManySimpleFieldName) {
        return junctionRightConstraint.tags.manyToManySimpleFieldName;
      }
      return this.camelCase(
        `${this.pluralize(this._singularizedTableName(rightTable))}-list`
      );
    },
  },
  true // Passing true here allows the plugin to overwrite existing inflectors.
);
```

For more information on custom inflector plugins, see the [makeAddInflectorsPlugin documentation](https://www.graphile.org/postgraphile/make-add-inflectors-plugin/).

### Smart Comments

The `@manyToManyFieldName` and `@manyToManySimpleFieldName` smart comments allow you to override the field names generated by this plugin.

For example, to rename the Connection field from `teamsByTeamMemberTeamId` to `teams`:

```sql
comment on constraint membership_team_id_fkey on p.membership is E'@manyToManyFieldName teams';
```

To rename both the Connection and simple collection fields (assuming simple collections are enabled):

```sql
comment on constraint membership_team_id_fkey on p.membership is E'@manyToManyFieldName teams\n@manyToManySimpleFieldName teamsList';
```
