insert into d.foo (foo_id, foo_name) values
  (1, 'Foo 1'),
  (2, 'Foo 2'),
  (3, 'Foo 3');

insert into d.bar (bar_id, bar_name) values
  (11, 'Bar 11'),
  (12, 'Bar 12'),
  (13, 'Bar 13');

insert into d.junction (j_foo_id, j_bar_id, created_at) values
  (1, 11, '2018-01-01T12:00:00Z'),
  (1, 12, '2018-01-02T12:00:00Z'),
  (1, 12, '2018-01-04T12:00:00Z'),
  (2, 11, '2018-01-03T12:00:00Z');