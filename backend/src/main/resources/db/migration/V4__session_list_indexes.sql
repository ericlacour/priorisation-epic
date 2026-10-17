-- Liste de toutes les sessions (FR-026), lue à chaque ouverture de l'accueil : les sessions sont conservées sans
-- limite, la liste ne doit pas parcourir toute la table pour les trier, ni tous les participants pour trouver
-- l'animateur de chaque session.
CREATE INDEX session_created_at_idx ON session (created_at DESC, session_id);
CREATE INDEX participant_facilitator_idx ON participant (session_id, joined_at)
    WHERE role = 'FACILITATOR';
