insert into f.person (id, name) values
  (1, 'Alice'),
  (2, 'Bob'),
  (3, 'Eve');

insert into f.junction (follower_id, following_id) values
  (2, 1),
  (3, 1),
  (3, 2);
