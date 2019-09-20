insert into c.foo (foo_id, foo_name) values
  (1, 'Foo 1'),
  (2, 'Foo 2'),
  (3, 'Foo 3');

insert into c.bar (bar_id, bar_name) values
  (11, 'Bar 11'),
  (12, 'Bar 12'),
  (13, 'Bar 13');

insert into c.junction (j_foo_id, j_bar_id) values
  (1, 11),
  (1, 12),
  (1, 12),
  (2, 11);