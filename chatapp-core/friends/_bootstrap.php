<?php

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth_required.php';
require_once __DIR__ . '/../user_profile.php';

function friendsNormalizeStatusRow(array $row): array {
    $currentUserId = (int)$row['current_user_id'];
    $requesterUserId = (int)$row['requester_user_id'];
    $friendUserId = $requesterUserId === $currentUserId
        ? (int)$row['addressee_user_id']
        : $requesterUserId;
    $friendProfile = $requesterUserId === $currentUserId
        ? userProfileFromRow([
            'id' => $row['addressee_user_id'],
            'username' => $row['addressee_username'],
            'username_tag' => $row['addressee_username_tag'] ?? null,
            'display_name' => $row['addressee_display_name'] ?? null
        ])
        : userProfileFromRow([
            'id' => $row['requester_user_id'],
            'username' => $row['requester_username'],
            'username_tag' => $row['requester_username_tag'] ?? null,
            'display_name' => $row['requester_display_name'] ?? null
        ]);

    return [
        'friendshipId' => (int)$row['id'],
        'status' => $row['status'],
        'friendUserId' => $friendUserId,
        'friendUsername' => $friendProfile['username'],
        'friendHandle' => $friendProfile['handle'],
        'friendUsernameBase' => $friendProfile['usernameBase'],
        'friendUsernameTag' => $friendProfile['usernameTag'],
        'friendDisplayName' => $friendProfile['displayName'],
        'requestedByUserId' => $requesterUserId,
        'conversationId' => $row['conversation_id'] !== null ? (int)$row['conversation_id'] : null,
        'createdAt' => $row['created_at'],
        'respondedAt' => $row['responded_at']
    ];
}
