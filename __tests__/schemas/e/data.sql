insert into e.person (id, person_name) values
  (1, 'Alice'),
  (2, 'Bob'),
  (3, 'Carol');

insert into e.team (id, team_name) values
  (1, 'Development'),
  (2, 'Sales'),
  (3, 'Marketing');

insert into e.tag (id, tag_name) values
  (1, 'high-performing'),
  (2, 'awesome'),
  (3, 'strange');

insert into e.membership (person_id, team_id) values
  (1, 1),
  (2, 2),
  (3, 3);

insert into e.person_tag_junction (person_id, tag_id) values
  (1, 2),
  (2, 3),
  (3, 1);

insert into e.team_tag_junction (team_id, tag_id) values
  (1, 3),
  (2, 1),
  (3, 2);
