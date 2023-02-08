-- Scenario:
-- * multiple junction tables, reusing names

drop schema if exists e cascade;

create schema e;

create table e.person (
  id serial primary key,
  person_name text not null
);

create table e.team (
  id serial primary key,
  team_name text not null
);

create table e.tag (
  id serial primary key,
  tag_name text not null
);

create table e.membership (
  person_id int not null constraint membership_person_id_fkey references e.person (id),
  team_id int not null constraint membership_team_id_fkey references e.team (id),
  primary key (person_id, team_id)
);
comment on constraint membership_person_id_fkey on e.membership is E'@manyToManyFieldName people';
comment on constraint membership_team_id_fkey on e.membership is E'@manyToManyFieldName teams';

create table e.person_tag_junction (
  person_id int not null constraint person_tag_junction_person_id_fkey references e.person (id),
  tag_id int not null constraint person_tag_junction_tag_id_fkey references e.tag (id),
  primary key (person_id, tag_id)
);
comment on constraint person_tag_junction_person_id_fkey on e.person_tag_junction is E'@manyToManyFieldName people';
comment on constraint person_tag_junction_tag_id_fkey on e.person_tag_junction is E'@manyToManyFieldName tags';

create table e.team_tag_junction (
  team_id int not null constraint team_tag_junction_team_id_fkey references e.team (id),
  tag_id int not null constraint team_tag_junction_tag_id_fkey references e.tag (id),
  primary key (team_id, tag_id)
);
comment on constraint team_tag_junction_team_id_fkey on e.team_tag_junction is E'@manyToManyFieldName teams';
comment on constraint team_tag_junction_tag_id_fkey on e.team_tag_junction is E'@manyToManyFieldName tags';
