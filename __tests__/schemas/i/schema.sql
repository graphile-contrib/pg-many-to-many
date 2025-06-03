drop schema if exists i cascade;

create schema i;

create type i.person_type as ENUM ('EMPLOYEE', 'EXTERNAL');

create table i.person (
  id int primary key,
  person_type i.person_type not null,
  person_name text not null,
  department text,
  company_name text
);

-- Both internal and external employees can be part of a team
create table i.team (
  id int primary key,
  team_name text
);

create table i.team_membership (
  person_id int,
  team_id int,
  primary key (person_id, team_id),
  constraint team_membership_person_id_fkey foreign key (person_id) references i.person (id),
  constraint team_membership_team_id_fkey foreign key (team_id) references i.team (id)
);

comment on table i.person is $$
@interface mode:single type:person_type
@type EMPLOYEE name:InternalEmployee attributes:department
@type EXTERNAL name:ExternalPerson attributes:company_name
$$;


comment on constraint team_membership_person_id_fkey on i.team_membership is E'@manyToManyFieldName members';
comment on constraint team_membership_team_id_fkey on i.team_membership is E'@manyToManyFieldName teams';
