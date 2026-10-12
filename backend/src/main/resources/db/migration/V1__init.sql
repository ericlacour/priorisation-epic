-- Schéma initial (data-model.md). Aucune colonne par critère : les valeurs sont rangées par clé de
-- critère (FR-017b), la liste des critères vient de la méthode de la session.

CREATE TABLE session (
    session_id           varchar(22)  PRIMARY KEY,
    animation_token_hash varchar(64)  NOT NULL,
    name                 varchar(120) NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    status               varchar(20)  NOT NULL DEFAULT 'PREPARATION'
                         CHECK (status IN ('PREPARATION', 'IN_PROGRESS', 'CLOSED')),
    -- Pas de CHECK sur la liste des méthodes : MethodRegistry la valide.
    method               varchar(20)  NOT NULL,
    method_version       integer      NOT NULL CHECK (method_version >= 1),
    scale_type           varchar(20)  NOT NULL DEFAULT 'CONTINUOUS'
                         CHECK (scale_type IN ('CONTINUOUS', 'FIBONACCI')),
    scale_max            integer      NOT NULL DEFAULT 10 CHECK (scale_max >= 2),
    created_at           timestamptz  NOT NULL,
    created_by_pseudo    varchar(40)  NOT NULL,
    version              integer      NOT NULL DEFAULT 0
);

CREATE TABLE participant (
    id                     uuid        PRIMARY KEY,
    session_id             varchar(22) NOT NULL REFERENCES session (session_id) ON DELETE CASCADE,
    pseudo                 varchar(40) NOT NULL CHECK (char_length(pseudo) BETWEEN 1 AND 40),
    role                   varchar(20) NOT NULL CHECK (role IN ('FACILITATOR', 'PARTICIPANT')),
    business_role          varchar(40),
    participant_token_hash varchar(64) NOT NULL,
    joined_at              timestamptz NOT NULL,
    last_seen_at           timestamptz NOT NULL
);
CREATE UNIQUE INDEX participant_session_pseudo_uq ON participant (session_id, lower(pseudo));

CREATE TABLE feature (
    id                uuid          PRIMARY KEY,
    session_id        varchar(22)   NOT NULL REFERENCES session (session_id) ON DELETE CASCADE,
    external_id       varchar(50)   NOT NULL CHECK (char_length(external_id) BETWEEN 1 AND 50),
    title             varchar(200)  NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    description       varchar(5000),
    marked_for_review boolean       NOT NULL DEFAULT false,
    review_reason     varchar(200),
    deleted_at        timestamptz,
    version           integer       NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX feature_session_external_id_uq
    ON feature (session_id, lower(external_id)) WHERE deleted_at IS NULL;

CREATE TABLE feature_criterion_value (
    feature_id    uuid        NOT NULL REFERENCES feature (id) ON DELETE CASCADE,
    criterion_key varchar(20) NOT NULL,
    value         integer     NOT NULL CHECK (value >= 1),
    PRIMARY KEY (feature_id, criterion_key)
);

CREATE TABLE voting_round (
    id                uuid        PRIMARY KEY,
    session_id        varchar(22) NOT NULL REFERENCES session (session_id) ON DELETE CASCADE,
    number            integer     NOT NULL CHECK (number >= 1),
    status            varchar(20) NOT NULL CHECK (status IN ('OPEN', 'REVEALED')),
    previous_round_id uuid        REFERENCES voting_round (id),
    opened_at         timestamptz NOT NULL,
    revealed_at       timestamptz,
    UNIQUE (session_id, number)
);

CREATE TABLE round_feature (
    round_id   uuid NOT NULL REFERENCES voting_round (id) ON DELETE CASCADE,
    feature_id uuid NOT NULL REFERENCES feature (id) ON DELETE CASCADE,
    PRIMARY KEY (round_id, feature_id)
);

CREATE TABLE vote (
    id             uuid        PRIMARY KEY,
    round_id       uuid        NOT NULL REFERENCES voting_round (id) ON DELETE CASCADE,
    feature_id     uuid        NOT NULL REFERENCES feature (id) ON DELETE CASCADE,
    participant_id uuid        NOT NULL REFERENCES participant (id) ON DELETE CASCADE,
    updated_at     timestamptz NOT NULL,
    UNIQUE (round_id, feature_id, participant_id)
);

CREATE TABLE vote_criterion_value (
    vote_id       uuid        NOT NULL REFERENCES vote (id) ON DELETE CASCADE,
    criterion_key varchar(20) NOT NULL,
    value         integer     NOT NULL CHECK (value >= 1),
    PRIMARY KEY (vote_id, criterion_key)
);

-- Entrées jamais modifiées ni supprimées (FR-025) : pas de clé étrangère, l'historique survit à la
-- fonctionnalité supprimée.
CREATE TABLE change_log (
    id            uuid         PRIMARY KEY,
    session_id    varchar(22)  NOT NULL REFERENCES session (session_id) ON DELETE CASCADE,
    at            timestamptz  NOT NULL,
    author_pseudo varchar(40)  NOT NULL,
    entity_type   varchar(20)  NOT NULL CHECK (entity_type IN ('SESSION', 'FEATURE')),
    entity_id     varchar(64)  NOT NULL,
    action        varchar(20)  NOT NULL CHECK (action IN ('VALUE_CHANGE', 'SCALE_CHANGE')),
    field         varchar(20),
    old_value     jsonb,
    new_value     jsonb
);
CREATE INDEX change_log_session_at_idx ON change_log (session_id, at);

CREATE TABLE import_preview (
    id            uuid        PRIMARY KEY,
    session_id    varchar(22) NOT NULL REFERENCES session (session_id) ON DELETE CASCADE,
    source_type   varchar(10) NOT NULL CHECK (source_type IN ('XLSX', 'CSV', 'JSON')),
    valid_rows    jsonb       NOT NULL,
    rejected_rows jsonb       NOT NULL,
    warnings      jsonb       NOT NULL,
    expires_at    timestamptz NOT NULL
);
CREATE INDEX import_preview_expires_idx ON import_preview (expires_at);
