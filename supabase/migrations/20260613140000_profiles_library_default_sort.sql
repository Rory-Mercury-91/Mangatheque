-- Tri par défaut de la bibliothèque, par compte utilisateur.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS library_default_sort TEXT;

COMMENT ON COLUMN profiles.library_default_sort IS
  'Tri initial bibliothèque : created_desc, title_asc, price_desc, etc.';
