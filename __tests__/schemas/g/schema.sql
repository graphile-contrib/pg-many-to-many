-- Scenario:
-- Potentially conflicting Edge/Connection type names
-- https://github.com/graphile-contrib/pg-many-to-many/issues/38

drop schema if exists g cascade;
create schema g;

create extension if not exists "pgcrypto";

CREATE TABLE g.users (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY
);

CREATE TABLE g.posts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text NOT NULL,
    content text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE g.post_authors (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id uuid NOT NULL REFERENCES g.posts(id),
    user_id uuid NOT NULL REFERENCES g.users(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX ON g.post_authors (post_id);
CREATE INDEX ON g.post_authors (user_id);

COMMENT ON TABLE g.post_authors IS E'@omit many';

COMMENT ON CONSTRAINT post_authors_user_id_fkey ON g.post_authors IS E'@manyToManyFieldName authors';