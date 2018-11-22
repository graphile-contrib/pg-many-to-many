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

create table p.team_member (
  person_id int references p.person (id),
  team_id int references p.team (id),
  created_at timestamptz not null,
  primary key (person_id, team_id)
);