drop schema if exists j cascade;

create schema j;

create type j.person as (
  id int,
  person_name text
);

create type j.team_membership as (
  person_id int,
  team_id int
);

create table j.internal_employee (
  id int primary key,
  person_name text not null,
  department text
);

create table j.external_person (
  id int primary key,
  person_name text not null,
  company_name text
);

-- Both internal and external employees can be part of a team
create table j.team (
  id int primary key,
  team_name text
);

create table j.internal_team_membership (
  person_id int,
  team_id int,
  primary key (person_id, team_id),
  constraint internal_team_membership_person_id_fkey foreign key (person_id) references j.internal_employee (id),
  constraint internal_team_membership_team_id_fkey foreign key (team_id) references j.team (id)
);

comment on constraint internal_team_membership_person_id_fkey
  on j.internal_team_membership is
  E'@manyToManyConnectionFieldName internalEmployees\n@manyToManySimpleFieldName internalEmployeesList';

comment on constraint internal_team_membership_team_id_fkey 
  on j.internal_team_membership is
  E'@manyToManyConnectionFieldName teams\n@manyToManySimpleFieldName teamsList';

create table j.external_team_membership (
  person_id int,
  team_id int,
  primary key (person_id, team_id),
  constraint external_team_membership_person_id_fkey foreign key (person_id) references j.external_person (id),
  constraint external_team_membership_team_id_fkey foreign key (team_id) references j.team (id)
);
comment on constraint external_team_membership_person_id_fkey
  on j.external_team_membership is
  E'@manyToManyConnectionFieldName externalPeople\n@manyToManySimpleFieldName externalPeopleList';

comment on constraint external_team_membership_team_id_fkey
  on j.external_team_membership is
  E'@manyToManyConnectionFieldName teams\n@manyToManySimpleFieldName teamsList';

COMMENT ON TYPE j.person IS $$
@interface mode:union
@name Person
@behavior node
@ref teams to:Team plural behavior:-connection
$$;
-- NOTE: The following annotation cannot be used (without disabling connection)
-- because the connection types don't match up across the implementations -
-- each are augmented by their own extended many-to-many connections which can
-- add additional information on edges.
--
--     `@ref teams to:Team plural`

COMMENT ON TABLE j.internal_employee IS $$
@implements Person
$$;

COMMENT ON TABLE j.external_person IS $$
@implements Person
$$;

COMMENT ON TYPE j.team_membership IS $$
@interface mode:union
@name TeamMembership
@behavior node
@ref member to:Person singular
@ref team to:Team singular
$$;

COMMENT ON TABLE j.internal_team_membership IS $$
@implements TeamMembership
@ref member via:(person_id)->j.internal_employee(id) singular
@ref team via:(team_id)->j.team(id) singular
$$;

COMMENT ON TABLE j.external_team_membership IS $$
@implements TeamMembership
@ref member via:(person_id)->j.external_person(id) singular
@ref team via:(team_id)->j.team(id) singular
$$;
