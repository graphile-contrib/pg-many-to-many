insert into u.entity (id, name) values
  (1, 'Person1'),
  (2, 'Person2'),
  (3, 'Person3'),
  (4, 'Team1'),
  (5, 'Team2'),
  (6, 'Team3');

insert into u.membership (member_id, entity_id, start_at, end_at) values
  (1, 4, '2018-01-01T12:00:00Z', null),
  (1, 5, '2018-01-02T12:00:00Z', '2018-01-03T12:00:00Z'),
  (1, 5, '2018-01-04T12:00:00Z', '2018-01-05T12:00:00Z'),
  (2, 4, '2018-01-03T12:00:00Z', null);

-- Person1: [Team1,Team2]
-- Person2: [Team1]
-- Person3: []
-- Team1: [Person1,Person2]
-- Team2: [Person1]
-- Team3: []
