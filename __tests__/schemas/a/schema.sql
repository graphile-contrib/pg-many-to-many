-- Scenario:
-- * One junction table record per unique pair of nodes (enforced by PK constraint)
-- * No additional junction table columns

drop schema if exists a cascade;
create schema a;

create table a.foo (
  foo_id integer primary key,
  foo_name text not null
);

create table a.bar (
  bar_id integer primary key,
  bar_name text not null
);

create table a.junction (
  j_foo_id integer references a.foo (foo_id),
  j_bar_id integer references a.bar (bar_id),
  primary key (j_foo_id, j_bar_id)
);