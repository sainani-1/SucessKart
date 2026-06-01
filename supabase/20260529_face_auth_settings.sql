alter table public.profiles
  add column if not exists face_auth_enabled boolean not null default false,
  add column if not exists face_mfa_enabled boolean not null default false,
  add column if not exists face_image_url text,
  add column if not exists face_descriptor jsonb,
  add column if not exists face_registered_at timestamptz;
