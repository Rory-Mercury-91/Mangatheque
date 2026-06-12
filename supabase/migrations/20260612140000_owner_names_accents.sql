-- Harmonise les prénoms des propriétaires avec accents.

UPDATE owners
SET name = 'Céline'
WHERE name IN ('Celine', 'céline', 'CELINE', 'CÉLINE');

UPDATE owners
SET name = 'Sébastien'
WHERE name IN ('Sebastien', 'sebastien', 'SEBASTIEN', 'SÉBASTIEN');
