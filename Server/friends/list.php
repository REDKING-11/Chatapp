<?php

require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$db = getDb();
$userId = (int)$user['id'];

$stmt = $db->prepare('
    SELECT
        f.id,
        f.requester_user_id,
        f.addressee_user_id,
        f.status,
        f.conversation_id,
        f.created_at,
        f.responded_at,
        ? AS current_user_id,
        requester.username AS requester_username,
        addressee.username AS addressee_username
    FROM friendships f
    JOIN users requester ON requester.id = f.requester_user_id
    JOIN users addressee ON addressee.id = f.addressee_user_id
    WHERE f.requester_user_id = ?
       OR f.addressee_user_id = ?
    ORDER BY f.created_at DESC
');
$stmt->execute([$userId, $userId, $userId]);
$rows = $stmt->fetchAll();

$accepted = [];
$incoming = [];
$outgoing = [];

foreach ($rows as $row) {
    $normalized = friendsNormalizeStatusRow($row);

    if ($row['status'] === 'accepted') {
        $accepted[] = $normalized;
        continue;
    }

    if ((int)$row['requester_user_id'] === $userId) {
        $outgoing[] = $normalized;
    } else {
        $incoming[] = $normalized;
    }
}

jsonResponse([
    'friends' => $accepted,
    'incomingRequests' => $incoming,
    'outgoingRequests' => $outgoing
]);
