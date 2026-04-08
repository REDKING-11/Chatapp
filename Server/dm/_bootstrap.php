<?php

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth_required.php';

const DM_RELAY_TTL_SECONDS = 86400;

function dmTrimmedString($value): ?string {
    if (!is_string($value)) {
        return null;
    }

    $trimmed = trim($value);
    return $trimmed !== '' ? $trimmed : null;
}

function dmRequireString(array $data, string $key, string $message): string {
    $value = dmTrimmedString($data[$key] ?? null);

    if ($value === null) {
        jsonResponse(['error' => $message], 400);
    }

    return $value;
}

function dmRequireArray(array $data, string $key, string $message): array {
    $value = $data[$key] ?? null;

    if (!is_array($value) || count($value) === 0) {
        jsonResponse(['error' => $message], 400);
    }

    return $value;
}

function dmCleanupExpiredRelayQueue(PDO $db): void {
    $stmt = $db->prepare('DELETE FROM dm_relay_queue WHERE expires_at <= UTC_TIMESTAMP()');
    $stmt->execute();
}

function dmLoadConversationOrFail(PDO $db, int $conversationId, int $userId): array {
    $stmt = $db->prepare('
        SELECT c.id
        FROM dm_conversations c
        JOIN dm_conversation_participants p
          ON p.conversation_id = c.id
        WHERE c.id = ?
          AND p.user_id = ?
        LIMIT 1
    ');
    $stmt->execute([$conversationId, $userId]);
    $conversation = $stmt->fetch();

    if (!$conversation) {
        jsonResponse(['error' => 'Conversation not found'], 404);
    }

    return $conversation;
}

function dmFetchConversationPayload(PDO $db, int $conversationId): array {
    $conversationStmt = $db->prepare('
        SELECT id, created_by_user_id, created_at, updated_at
        FROM dm_conversations
        WHERE id = ?
        LIMIT 1
    ');
    $conversationStmt->execute([$conversationId]);
    $conversation = $conversationStmt->fetch();

    if (!$conversation) {
        jsonResponse(['error' => 'Conversation not found'], 404);
    }

    $participantsStmt = $db->prepare('
        SELECT p.user_id, u.username, p.joined_at
        FROM dm_conversation_participants p
        JOIN users u ON u.id = p.user_id
        WHERE p.conversation_id = ?
        ORDER BY p.joined_at ASC
    ');
    $participantsStmt->execute([$conversationId]);
    $participants = $participantsStmt->fetchAll();

    $keysStmt = $db->prepare('
        SELECT device_id, recipient_user_id, wrapped_conversation_key, algorithm, key_version, created_at
        FROM dm_conversation_wrapped_keys
        WHERE conversation_id = ?
        ORDER BY created_at ASC
    ');
    $keysStmt->execute([$conversationId]);
    $wrappedKeys = $keysStmt->fetchAll();

    return [
        'conversation' => [
            'id' => (int)$conversation['id'],
            'createdByUserId' => (int)$conversation['created_by_user_id'],
            'createdAt' => $conversation['created_at'],
            'updatedAt' => $conversation['updated_at'],
            'participants' => array_map(function ($row) {
                return [
                    'userId' => (int)$row['user_id'],
                    'username' => $row['username'],
                    'joinedAt' => $row['joined_at']
                ];
            }, $participants),
            'wrappedKeys' => array_map(function ($row) {
                return [
                    'deviceId' => $row['device_id'],
                    'recipientUserId' => (int)$row['recipient_user_id'],
                    'wrappedConversationKey' => $row['wrapped_conversation_key'],
                    'algorithm' => $row['algorithm'],
                    'keyVersion' => (int)$row['key_version'],
                    'createdAt' => $row['created_at']
                ];
            }, $wrappedKeys)
        ],
        'relayTtlSeconds' => DM_RELAY_TTL_SECONDS
    ];
}

function dmEnsureValidEnvelope(array $data): array {
    return [
        'ciphertext' => dmRequireString($data, 'ciphertext', 'ciphertext is required'),
        'nonce' => dmRequireString($data, 'nonce', 'nonce is required'),
        'aad' => dmRequireString($data, 'aad', 'aad is required'),
        'tag' => dmRequireString($data, 'tag', 'tag is required')
    ];
}
