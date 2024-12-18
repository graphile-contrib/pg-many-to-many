insert into j.internal_employee (id, person_name, department) values
  (1, 'Person1', 'Department1'),
  (3, 'Person3', 'Department2');

insert into j.external_person (id, person_name, company_name) values
  (2, 'Person2', 'Company1');

insert into j.team (id, team_name) values
  (1, 'Team1'),
  (2, 'Team2'),
  (3, 'Team3');

insert into j.internal_team_membership (person_id, team_id) values
  (1, 1),
  (1, 2);

insert into j.external_team_membership (person_id, team_id) values
  (2, 1);

-- Person1: [Team1,Team2]
-- Person2: [Team1]
-- Person3: []
-- Team1: [Person1,Person2]
-- Team2: [Person1]
-- Team3: []
