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
  person_id int constraint team_member_person_id_fkey references p.person (id),
  team_id int constraint team_member_team_id_fkey references p.team (id),
  created_at timestamptz not null,
  primary key (person_id, team_id)
);

comment on constraint team_member_person_id_fkey on p.team_member is E'@manyToManyFieldName members\n@manyToManySimpleFieldName membersList';

