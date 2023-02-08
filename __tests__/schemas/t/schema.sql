drop schema if exists t cascade;

create schema t;
create extension btree_gist with schema t;

create table t.person (
  id serial primary key,
  person_name text not null
);

create table t.team (
  id serial primary key,
  team_name text not null
);

create table t.membership (
  id serial primary key,
  person_id int not null constraint membership_person_id_fkey references t.person (id),
  team_id int not null constraint membership_team_id_fkey references t.team (id),
  start_at timestamptz not null,
  end_at timestamptz,
  constraint membership_unique_nonoverlapping exclude using gist (
    person_id with =,
    team_id with =,
    tstzrange(start_at, end_at) with &&
  )
);

create index on t.membership(person_id);
create index on t.membership(team_id);

comment on constraint membership_person_id_fkey on t.membership is E'@manyToManyFieldName members';

comment on constraint membership_team_id_fkey on t.membership is E'@simpleCollections omit';
