insert into h.person (id_a, id_b, person_name) values
  (1, 1, 'Person1'),
  (2, 2, 'Person2'),
  (3, 3, 'Person3');

insert into h.team (id_1, id_2, team_name) values
  (1, 1, 'Team1'),
  (2, 2, 'Team2'),
  (3, 3, 'Team3');

insert into h.membership (person_id_a, person_id_b, team_id_1, team_id_2) values
  (1, 1, 1, 1),
  (1, 1, 2, 2),
  (2, 2, 1, 1);

-- Person1: [Team1,Team2]
-- Person2: [Team1]
-- Person3: []
-- Team1: [Person1,Person2]
-- Team2: [Person1]
-- Team3: []
