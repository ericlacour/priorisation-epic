-- Aperçu d'import : les colonnes ignorées et l'échelle d'un export JSON à appliquer à une session vide
-- (contract/schemas/import-preview.json). L'échelle est absente pour Excel et CSV.
ALTER TABLE import_preview ADD COLUMN ignored_columns jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE import_preview ADD COLUMN scale_type varchar(20)
    CHECK (scale_type IN ('CONTINUOUS', 'FIBONACCI'));
ALTER TABLE import_preview ADD COLUMN scale_max integer CHECK (scale_max >= 2);
ALTER TABLE import_preview ADD CONSTRAINT import_preview_scale_complete
    CHECK ((scale_type IS NULL) = (scale_max IS NULL));
