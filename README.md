# @graphile-contrib/pg-many-to-many

[![Package on npm](https://img.shields.io/npm/v/@graphile-contrib/pg-many-to-many.svg)](https://www.npmjs.com/package/@graphile-contrib/pg-many-to-many) [![CircleCI](https://circleci.com/gh/graphile-contrib/pg-many-to-many.svg?style=svg)](https://circleci.com/gh/graphile-contrib/pg-many-to-many)

This PostGraphile preset adds connection fields for many-to-many relations to your GraphQL schema.

> Requires `postgraphile@^5.0.0` or `graphile-build-pg@^5.0.0`

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

Install the plugin into your PostGraphile/Graphile-Build project:

```bash
yarn add @graphile-contrib/pg-many-to-many
```

Then add this preset to the `extends` list of your Graphile Config:

```js
// graphile.config.mjs (or similar)

import { PgManyToManyPreset } from "@graphile-contrib/pg-many-to-many";

const preset = {
  extends: [
    // ...
    PgManyToManyPreset,
  ],
  // ...
};

export default preset;
```

## Excluding Fields

To exclude certain many-to-many fields from appearing in your GraphQL schema, you can use `@behavior -manyToMany` [smart tags](https://postgraphile.org/postgraphile/next/smart-tags) on constraints and tables.

Here is an example of using a smart comment on a constraint:

```
create table p.foo (
  id serial primary key,
  name text not null
);

create table p.bar (
  id serial primary key,
  name text not null
);

create table p.qux (
  foo_id int constraint qux_foo_id_fkey references p.foo (id),
  bar_id int constraint qux_bar_id_fkey references p.bar (id),
  primary key (foo_id, bar_id)
);

-- `Foo` and `Bar` would normally have `barsBy...` and `foosBy...` fields,
-- but this smart comment causes the constraint between `qux` and `bar`
-- to be ignored, preventing the fields from being generated.
comment on constraint qux_bar_id_fkey on p.qux is E'@behavior -manyToMany';
```

Here is an example of using a smart comment on a table:

```
create table p.foo (
  id serial primary key,
  name text not null
);

create table p.bar (
  id serial primary key,
  name text not null
);

create table p.corge (
  foo_id int constraint corge_foo_id_fkey references p.foo (id),
  bar_id int constraint corge_bar_id_fkey references p.bar (id),
  primary key (foo_id, bar_id)
);

-- `Foo` and `Bar` would normally have `barsBy...` and `foosBy...` fields,
-- but this smart comment causes `corge` to be excluded from consideration
-- as a junction table, preventing the fields from being generated.
comment on table p.corge is E'@behavior -manyToMany';
```

## Inflection

To avoid naming conflicts, this plugin uses a verbose naming convention (e.g. `teamsByTeamMemberTeamId`). You can override this by writing a custom inflector plugin or by using smart comments in your SQL schema.

### Inflector Plugin

Writing a custom inflector plugin gives you full control over the GraphQL field names. Here is an example plugin that shortens the field names to just the table name (producing e.g. `teams`):

> :warning: Warning: Simplifying the field names as shown below will lead to field name conflicts if your junction table has multiple foreign keys referencing the same table. You will need to customize the inflector function to resolve the conflicts.

**TODO**: include example of overriding the inflectors in V5 format.

For more information on custom inflector plugins, see the [inflection documentation](https://postgraphile.org/postgraphile/next/inflection).

### Smart Comments

The `@manyToManyFieldName` and `@manyToManySimpleFieldName` smart comments allow you to override the field names generated by this plugin.

For example, to rename the Connection field from `teamsByTeamMemberTeamId` to `teams`:

```sql
comment on constraint membership_team_id_fkey on p.membership is E'@manyToManyFieldName teams';
```

The `@manyToManyFieldName` smart comment provides the base name for both the connection and simple collection field names (assuming simple collections are enabled). This base name is then fed through the `connectionField` inflector for connection fields (which by default makes no change) and the `listField` inflector for simple collection fields (which by default appends `List`). In the following example, we rename both the connection and simple collection fields (assuming default inflection) to `teams` and `teamsList` respectively:

```sql
comment on constraint membership_team_id_fkey on p.membership is E'@manyToManyFieldName teams';
```

The `@manyToManyConnectionFieldName` and `@manyToManySimpleFieldName` smart comments can be used to fully override the connection and simple collection field names respectively without applying the `connectionField` and `listField` inflections. For example, to rename the connection and simple collection fields to `teamsConnection` and `teamsSimple`:

```sql
comment on constraint membership_team_id_fkey on p.membership is E'@manyToManyConnectionFieldName teamsConnection\n@manyToManySimpleFieldName teamsSimple';
```

The `@manyToManyConnectionFieldName` and `@manyToManySimpleFieldName` smart comments take precedence over the `@manyToManyFieldName` smart comment.
