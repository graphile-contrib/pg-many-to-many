drop schema if exists p cascade;

create schema p;

create table p.person (
  id serial primary key,
  person_name text not null
);

create table p.team (
  id serial primary key,
  team_name text not null
);

create table p.membership (
  person_id int constraint membership_person_id_fkey references p.person (id),
  team_id int constraint membership_team_id_fkey references p.team (id),
  created_at timestamptz not null,
  primary key (person_id, team_id)
);

comment on constraint membership_person_id_fkey on p.membership is E'@manyToManyFieldName members\n@manyToManySimpleFieldName membersList';

comment on constraint membership_team_id_fkey on p.membership is E'@simpleCollections omit';

create table p.foo (
  id serial primary key,
  name text not null
);

create table p.bar (
  id serial primary key,
  name text not null
);

create table p.baz (
  foo_id int constraint baz_foo_id_fkey references p.foo (id),
  bar_id int constraint baz_bar_id_fkey references p.bar (id),
  primary key (foo_id, bar_id)
);

comment on constraint baz_bar_id_fkey on p.baz is E'@omit';

create table p.qux (
  foo_id int constraint qux_foo_id_fkey references p.foo (id),
  bar_id int constraint qux_bar_id_fkey references p.bar (id),
  primary key (foo_id, bar_id)
);

comment on table p.qux is E'@omit all';
comment on constraint qux_bar_id_fkey on p.qux is E'@omit manyToMany';

create table p.corge (
  foo_id int constraint corge_foo_id_fkey references p.foo (id),
  bar_id int constraint corge_bar_id_fkey references p.bar (id),
  primary key (foo_id, bar_id)
);

comment on table p.corge is E'@omit all,manyToMany';
