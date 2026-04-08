<?php

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth_required.php';

function friendsNormalizeStatusRow(array $row): array {
    $currentUserId = (int)$row['current_user_id'];
    $requesterUserId = (int)$row['requester_user_id'];
    $friendUserId = $requesterUserId === $currentUserId
        ? (int)$row['addressee_user_id']
        : $requesterUserId;
    $friendUsername = $requesterUserId === $currentUserId
        ? $row['addressee_username']
        : $row['requester_username'];

    return [
        'friendshipId' => (int)$row['id'],
        'status' => $row['status'],
        'friendUserId' => $friendUserId,
        'friendUsername' => $friendUsername,
        'requestedByUserId' => $requesterUserId,
        'conversationId' => $row['conversation_id'] !== null ? (int)$row['conversation_id'] : null,
        'createdAt' => $row['created_at'],
        'respondedAt' => $row['responded_at']
    ];
}
