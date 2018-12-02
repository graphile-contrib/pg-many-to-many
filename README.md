# @graphile-contrib/pg-many-to-many

This Graphile Engine plugin adds connection fields for many-to-many relations.

> Requires `postgraphile@^4.1.0-rc.2` or `graphile-build-pg@^4.1.0-rc.2`

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
yarn add postgraphile@^4.1.0-rc.2
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

To avoid naming conflicts, this plugin uses a verbose naming convention (e.g. `teamsByTeamMemberTeamId`), similar to how related fields are named by default in PostGraphile v4.

You can override this by adding an inflector plugin. For example, the following plugin shortens the names to just the table name (producing e.g. `teams`):

```js
const { makeAddInflectorsPlugin } = require("graphile-utils");

module.exports = makeAddInflectorsPlugin(
  // TODO
);
```

See the [makeAddInflectorsPlugin documentation](https://www.graphile.org/postgraphile/make-add-inflectors-plugin/) for more information.