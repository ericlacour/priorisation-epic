-- Nom de session unique parmi toutes les sessions (FR-001a), sans tenir compte de la casse ni des espaces autour.
-- Comme pour les pseudos (V2), l'application calcule la clé (Session.nameKey : NFKC, espaces retirés aux extrémités,
-- minuscules) et la base ne fait que l'imposer. Même calcul ici, pour les lignes existantes et pour le filet
-- ci-dessous. Type text : NFKC peut allonger le nom.
CREATE FUNCTION session_name_key(name text) RETURNS text AS $$
    SELECT lower(regexp_replace(normalize(name, NFKC), '^\s+|\s+$', '', 'g'));
$$ LANGUAGE sql IMMUTABLE;

ALTER TABLE session ADD COLUMN name_key text;
UPDATE session SET name_key = session_name_key(name);

-- Sessions déjà créées sous le même nom : la plus ancienne le garde, les suivantes reçoivent « (2) », « (3) »… dans
-- l'ordre de création (premier suffixe libre), espaces autour retirés et nom raccourci si besoin pour tenir en 120
-- caractères. Rien n'est supprimé.
DO $$
DECLARE
    duplicate record;
    n integer;
    candidate text;
BEGIN
    FOR duplicate IN
        SELECT session_id, name
        FROM (SELECT session_id, name, created_at,
                     row_number() OVER (PARTITION BY name_key ORDER BY created_at, session_id) AS rank
              FROM session) ranked
        WHERE rank > 1
        ORDER BY created_at, session_id
    LOOP
        n := 2;
        LOOP
            candidate := left(regexp_replace(duplicate.name, '^\s+|\s+$', '', 'g'),
                              120 - char_length(' (' || n || ')')) || ' (' || n || ')';
            EXIT WHEN NOT EXISTS (SELECT 1 FROM session WHERE name_key = session_name_key(candidate));
            n := n + 1;
        END LOOP;
        UPDATE session SET name = candidate, name_key = session_name_key(candidate)
        WHERE session_id = duplicate.session_id;
    END LOOP;
END;
$$;

-- Filet pour les écritures qui ne fournissent pas la clé (outils, requêtes à la main dans la console SQL) : une
-- insertion sans clé, ou un renommage qui laisse l'ancienne clé, la recalcule. L'application, elle, la fournit
-- toujours, à l'insertion comme au renommage.
CREATE FUNCTION session_default_name_key() RETURNS trigger AS $$
BEGIN
    IF NEW.name_key IS NULL
        OR (TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name
            AND NEW.name_key IS NOT DISTINCT FROM OLD.name_key) THEN
        NEW.name_key := session_name_key(NEW.name);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER session_name_key_default BEFORE INSERT OR UPDATE OF name, name_key ON session
    FOR EACH ROW EXECUTE FUNCTION session_default_name_key();

ALTER TABLE session ALTER COLUMN name_key SET NOT NULL;
CREATE UNIQUE INDEX session_name_key_uq ON session (name_key);
