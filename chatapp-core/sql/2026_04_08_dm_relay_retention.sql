ALTER TABLE dm_conversations
    ADD COLUMN relay_ttl_seconds INT NOT NULL DEFAULT 86400 AFTER updated_at,
    ADD COLUMN relay_ttl_requested_seconds INT NULL DEFAULT NULL AFTER relay_ttl_seconds,
    ADD COLUMN relay_ttl_requested_by_user_id INT NULL DEFAULT NULL AFTER relay_ttl_requested_seconds,
    ADD COLUMN relay_ttl_requested_at TIMESTAMP NULL DEFAULT NULL AFTER relay_ttl_requested_by_user_id;

ALTER TABLE dm_conversations
    ADD KEY idx_dm_conversations_relay_ttl_requested_by (relay_ttl_requested_by_user_id),
    ADD CONSTRAINT fk_dm_conversations_relay_ttl_requested_by
        FOREIGN KEY (relay_ttl_requested_by_user_id)
        REFERENCES users (id)
        ON DELETE SET NULL;
