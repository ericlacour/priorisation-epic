-- L'unicité des pseudos ne dépend plus du repliement de casse de la base (collation) : l'application calcule la
-- clé (Pseudo.uniquenessKey : NFKC puis minuscules, indépendant de la langue) et la base ne fait que l'imposer.
ALTER TABLE participant ADD COLUMN pseudo_key varchar(200);
UPDATE participant SET pseudo_key = lower(pseudo);

-- Filet pour les insertions qui ne fournissent pas la clé (outils, jeux de données) : l'application, elle, la fournit toujours.
CREATE FUNCTION participant_default_pseudo_key() RETURNS trigger AS $$
BEGIN
    IF NEW.pseudo_key IS NULL THEN
        NEW.pseudo_key := lower(NEW.pseudo);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER participant_pseudo_key_default BEFORE INSERT ON participant
    FOR EACH ROW EXECUTE FUNCTION participant_default_pseudo_key();

ALTER TABLE participant ALTER COLUMN pseudo_key SET NOT NULL;
DROP INDEX participant_session_pseudo_uq;
CREATE UNIQUE INDEX participant_session_pseudo_key_uq ON participant (session_id, pseudo_key);
