ALTER TABLE dm_conversations
    ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'direct' AFTER created_by_user_id,
    ADD COLUMN title VARCHAR(255) NULL AFTER kind;

UPDATE dm_conversations c
SET c.kind = (
    CASE
        WHEN (
            SELECT COUNT(*)
            FROM dm_conversation_participants p
            WHERE p.conversation_id = c.id
        ) > 2 THEN 'group'
        ELSE 'direct'
    END
);
