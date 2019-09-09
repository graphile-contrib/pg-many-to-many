drop schema if exists f cascade;

create schema f;

create table f.person (
  id serial primary key,
  name text
);

create table f.junction (
  follower_id int constraint junction_follower_id_fkey references f.person (id),
  following_id int constraint junction_following_id_fkey references f.person (id),
  primary key (follower_id, following_id)
);

comment on table f.junction is E'@omit all,many';
comment on constraint junction_follower_id_fkey on f.junction is E'@manyToManyFieldName followers';
comment on constraint junction_following_id_fkey on f.junction is E'@manyToManyFieldName following';