-- Co-achat partagé (coût divisé) vs achats distincts (chacun paie le prix plein).



ALTER TABLE volumes

  ADD COLUMN IF NOT EXISTS shared_purchase BOOLEAN NOT NULL DEFAULT true;



COMMENT ON COLUMN volumes.shared_purchase IS

  'Si true et plusieurs acheteurs : coût du tome divisé entre eux. Si false : chaque acheteur paie le prix plein.';


