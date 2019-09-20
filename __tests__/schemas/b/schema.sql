-- Scenario:
-- * One junction table record per unique pair of nodes (enforced by compound PK constraint)
-- * Additional junction table column (created_at)

drop schema if exists b cascade;
create schema b;

create table b.foo (
  foo_id integer primary key,
  foo_name text not null
);

create table b.bar (
  bar_id integer primary key,
  bar_name text not null
);

create table b.junction (
  j_foo_id integer references b.foo (foo_id),
  j_bar_id integer references b.bar (bar_id),
  created_at timestamptz not null,
  primary key (j_foo_id, j_bar_id)
);