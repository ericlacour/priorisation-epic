-- Nom de session unique parmi toutes les sessions (FR-001a), sans tenir compte de la casse ni des espaces autour.
-- La clé est calculée par la base seule, dans une colonne générée : la même fonction sert à l'index unique, aux
-- recherches de l'application (`where name_key = session_name_key(:name)`) et à toute écriture faite à la main dans
-- la console SQL. Aucun calcul en double côté Java, donc aucun écart possible entre les deux. Formes de
-- compatibilité repliées (NFKC), espaces retirés aux extrémités, minuscules selon la collation de la base ; les
-- accents comptent.
CREATE FUNCTION session_name_key(name text) RETURNS text AS $$
    SELECT lower(regexp_replace(normalize(name, NFKC), '^\s+|\s+$', '', 'g'));
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

-- Sessions déjà créées sous le même nom : la plus ancienne le garde, les suivantes reçoivent « (2) », « (3) »… dans
-- l'ordre de création (premier suffixe libre), espaces autour retirés et nom raccourci si besoin pour tenir en 120
-- caractères. Rien n'est supprimé. Le compteur de la session renommée avance, comme pour un renommage ; le nom
-- n'entre pas dans l'historique (comme dans updateSettings).
DO $$
DECLARE
    duplicate record;
    base text;
    n integer;
    candidate text;
BEGIN
    FOR duplicate IN
        SELECT session_id, name
        FROM (SELECT session_id, name, created_at,
                     row_number() OVER (PARTITION BY session_name_key(name)
                                        ORDER BY created_at, session_id) AS rank
              FROM session) ranked
        WHERE rank > 1
        ORDER BY created_at, session_id
    LOOP
        base := regexp_replace(duplicate.name, '^\s+|\s+$', '', 'g');
        n := 2;
        LOOP
            -- Raccourci au besoin, sans laisser d'espace avant le suffixe.
            candidate := regexp_replace(left(base, 120 - char_length(' (' || n || ')')), '\s+$', '')
                         || ' (' || n || ')';
            EXIT WHEN NOT EXISTS (
                SELECT 1 FROM session WHERE session_name_key(name) = session_name_key(candidate));
            n := n + 1;
        END LOOP;
        UPDATE session SET name = candidate, version = version + 1
        WHERE session_id = duplicate.session_id;
    END LOOP;
END;
$$;

ALTER TABLE session ADD COLUMN name_key text GENERATED ALWAYS AS (session_name_key(name)) STORED;
CREATE UNIQUE INDEX session_name_key_uq ON session (name_key);
