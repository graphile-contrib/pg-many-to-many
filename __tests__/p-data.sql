insert into p.person (id, person_name) values
  (1, 'Person1'),
  (2, 'Person2'),
  (3, 'Person3');

insert into p.team (id, team_name) values
  (1, 'Team1'),
  (2, 'Team2'),
  (3, 'Team3');

insert into p.team_member (person_id, team_id, created_at) values
  (1, 1, '2018-01-01T12:00:00Z'),
  (1, 2, '2018-01-02T12:00:00Z'),
  (2, 1, '2018-01-03T12:00:00Z');

-- Person1: [Team1,Team2]
-- Person2: [Team1]
-- Person3: []
-- Team1: [Person1,Person2]
-- Team2: [Person1]
-- Team3: []