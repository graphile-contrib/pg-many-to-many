-- Scenario:
-- * Multiple junction table records per unique pair of nodes
-- * Additional junction table column (created_at)

drop schema if exists d cascade;
create schema d;

create table d.foo (
  foo_id integer primary key,
  foo_name text not null
);

create table d.bar (
  bar_id integer primary key,
  bar_name text not null
);

create table d.junction (
  id serial primary key,
  j_foo_id integer references d.foo (foo_id),
  j_bar_id integer references d.bar (bar_id),
  created_at timestamptz not null
);