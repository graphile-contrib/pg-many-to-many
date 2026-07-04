const { printSchema } = require("graphql");
const { makeSchema } = require("postgraphile");
const {
  default: postgraphilePresetAmber,
} = require("postgraphile/presets/amber");
const { makeJSONPgSmartTagsPlugin } = require("postgraphile/utils");
const pgAdaptor = require("@dataplan/pg/adaptors/pg");
const { PgManyToManyPreset } = require("../");
const { withPgClient } = require("./helpers");

const schemaSql = `
drop schema if exists poly cascade;
create schema poly;

create table poly.account (
  id integer primary key,
  name text not null
);

create table poly.currency (
  id integer primary key,
  code text not null unique
);

create table poly.event_code (
  code text primary key
);

insert into poly.event_code (code) values ('created');

create table poly.session (
  id integer primary key,
  account_id integer not null references poly.account(id),
  currency_id integer not null references poly.currency(id),
  current_event_id integer
);

create table poly.event (
  id integer primary key,
  session_id integer not null references poly.session(id),
  code text not null references poly.event_code(code),
  created_at timestamptz not null default now()
);

alter table poly.session
  add constraint session_current_event_id_fkey
  foreign key (current_event_id) references poly.event(id);

create index session_current_event_id_idx on poly.session(current_event_id);
create index session_account_id_idx on poly.session(account_id);
create index session_currency_id_idx on poly.session(currency_id);

create table poly.event__created (
  id integer primary key references poly.event(id) on delete cascade,
  note text
);
`;

const polymorphismTags = makeJSONPgSmartTagsPlugin({
  version: 1,
  config: {
    class: {
      "poly.event": {
        tags: {
          interface: "mode:relational type:code",
          type: ["created references:event__created"],
        },
      },
    },
  },
});

test("many-to-many candidates do not break relational polymorphic interfaces", async () => {
  await withPgClient(async (pgClient) => {
    await pgClient.query(schemaSql);

    const { schema } = await makeSchema({
      extends: [postgraphilePresetAmber, PgManyToManyPreset],
      plugins: [polymorphismTags],
      pgServices: [
        {
          name: "main",
          adaptor: pgAdaptor,
          pgSettingsKey: "pgSettings",
          pgSettings: {},
          withPgClientKey: "withPgClient",
          withPgClient,
          pgSettingsForIntrospection: {},
          schemas: ["poly"],
          adaptorSettings: {
            poolClient: pgClient,
          },
        },
      ],
    });

    const sdl = printSchema(schema);

    expect(sdl).toContain("interface Event");
    expect(sdl).toContain("type EventCreated implements Event");
  });
});
