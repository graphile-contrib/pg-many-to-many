insert into i.person (id, person_type, person_name, department, company_name) values
  (1, 'EMPLOYEE', 'Person1', 'Department1', null),
  (2, 'EXTERNAL', 'Person2', null, 'Company1'),
  (3, 'EMPLOYEE', 'Person3', 'Department1', null);

insert into i.team (id, team_name) values
  (1, 'Team1'),
  (2, 'Team2'),
  (3, 'Team3');

insert into i.team_membership (person_id, team_id) values
  (1, 1),
  (1, 2),
  (2, 1);

-- Person1: [Team1,Team2]
-- Person2: [Team1]
-- Person3: []
-- Team1: [Person1,Person2]
-- Team2: [Person1]
-- Team3: []
