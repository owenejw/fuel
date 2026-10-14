-- Saved water bottles ("My bottle", 750 mL) and an emoji avatar with a background colour, per profile.
alter table profiles add column water_bottles jsonb not null default '[]'::jsonb check (jsonb_typeof(water_bottles) = 'array');
alter table profiles add column avatar_emoji text check (avatar_emoji is null or char_length(avatar_emoji) <= 16);
alter table profiles add column avatar_color text check (avatar_color is null or avatar_color ~ '^#[0-9a-fA-F]{6}$');
