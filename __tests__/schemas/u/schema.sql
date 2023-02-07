drop schema if exists u cascade;

create schema u;

create table u.entity (
  id serial primary key,
  name text not null
);

create table u.membership (
  id serial primary key,
  member_id int not null constraint membership_member_id_fkey references u.entity (id),
  entity_id int not null constraint membership_entity_id_fkey references u.entity (id),
  start_at timestamptz not null,
  end_at timestamptz
);

create index on u.membership(member_id);
create index on u.membership(entity_id);
