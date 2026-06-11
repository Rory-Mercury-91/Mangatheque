-- Texte personnalisé des pastilles propriétaire (initiale par défaut si null).

ALTER TABLE owners
  ADD COLUMN badge_label TEXT;

COMMENT ON COLUMN owners.badge_label IS
  'Texte affiché sur les pastilles (1–4 car.). Null = initiale du prénom.';
