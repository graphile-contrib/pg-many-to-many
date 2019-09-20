-- Scenario:
-- * Multiple junction table records per unique pair of nodes
-- * No additional junction table columns

drop schema if exists c cascade;
create schema c;

create table c.foo (
  foo_id integer primary key,
  foo_name text not null
);

create table c.bar (
  bar_id integer primary key,
  bar_name text not null
);

create table c.junction (
  id serial primary key,
  j_foo_id integer references c.foo (foo_id),
  j_bar_id integer references c.bar (bar_id)
);