drop schema if exists h cascade;

create schema h;

create table h.person (
  id_a int,
  id_b int,
  person_name text not null,
  primary key (id_a, id_b)
);

create table h.team (
  id_1 int,
  id_2 int,
  team_name text not null,
  primary key (id_1, id_2)
);

create table h.membership (
  person_id_a int,
  person_id_b int,
  team_id_1 int,
  team_id_2 int,
  constraint membership_person_id_fkey foreign key (person_id_a, person_id_b) references h.person (id_a, id_b),
  constraint membership_team_id_fkey foreign key (team_id_1, team_id_2) references h.team (id_1, id_2),
  primary key (person_id_a, person_id_b, team_id_1, team_id_2)
);

comment on constraint membership_person_id_fkey on h.membership is E'@manyToManyFieldName members';
comment on constraint membership_team_id_fkey on h.membership is E'@manyToManyFieldName teams';
