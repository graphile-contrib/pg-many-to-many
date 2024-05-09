drop schema if exists h cascade;

create schema h;

create table h.person (
  id_a int,
  id_b int,
  person_name text not null,
  primary key (id_a, id_b)
);

create table h.team (
  id int primary key,
  team_name text not null
);

create table h.membership (
  person_id_a int,
  person_id_b int,
  team_id int constraint membership_team_id_fkey references h.team (id),
  constraint membership_person_id_fkey foreign key (person_id_a, person_id_b) references h.person (id_a, id_b),
  primary key (person_id_a, person_id_b, team_id)
);

comment on constraint membership_person_id_fkey on h.membership is E'@manyToManyFieldName members';
comment on constraint membership_team_id_fkey on h.membership is E'@manyToManyFieldName teams';
