import { parseJsonResponse } from "../../lib/api";

const CORE_API_BASE = import.meta.env.VITE_CORE_API_BASE;

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

export async function initializeSecureDm(currentUser) {
  if (!window.secureDm) {
    throw new Error("Secure DM is only available inside the Electron desktop app");
  }

  return window.secureDm.initializeDevice({
    userId: currentUser.id,
    username: currentUser.username
  });
}

export async function registerSecureDmDevice({ token, currentUser }) {
  const deviceBundle = await window.secureDm.getDeviceBundle({
    userId: currentUser.id,
    username: currentUser.username
  });

  const res = await fetch(`${CORE_API_BASE}/keys/devices/register.php`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(deviceBundle)
  });

  return parseJsonResponse(res, "Failed to register DM device");
}

export async function fetchUserDmDevices({ token, userId }) {
  const res = await fetch(
    `${CORE_API_BASE}/keys/devices/list.php?userId=${encodeURIComponent(userId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  return parseJsonResponse(res, "Failed to fetch DM devices");
}

export async function createDirectConversation({
  token,
  currentUser,
  recipientUser
}) {
  const recipientDevicesResponse = await fetchUserDmDevices({
    token,
    userId: recipientUser.id
  });

  if (!recipientDevicesResponse.devices?.length) {
    throw new Error("That user has not set up secure DMs on any device yet");
  }

  const localConversation = await window.secureDm.createConversation({
    userId: currentUser.id,
    username: currentUser.username,
    title: `DM with ${recipientUser.username}`,
    participants: [recipientUser.id],
    recipientDevices: recipientDevicesResponse.devices
  });

  const res = await fetch(`${CORE_API_BASE}/dm/conversations/create.php`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      participantUserIds: [recipientUser.id],
      wrappedKeys: localConversation.wrappedKeys
    })
  });

  const data = await parseJsonResponse(res, "Failed to create DM conversation");
  await window.secureDm.adoptConversationId({
    userId: currentUser.id,
    username: currentUser.username,
    fromConversationId: localConversation.conversationId,
    toConversationId: data.conversation.id,
    title: `DM with ${recipientUser.username}`
  });

  return {
    remoteConversation: data.conversation,
    localConversation: {
      ...localConversation,
      conversationId: data.conversation.id
    }
  };
}

export async function importRemoteConversation({ token, currentUser, conversationId }) {
  const res = await fetch(
    `${CORE_API_BASE}/dm/conversations/get.php?conversationId=${encodeURIComponent(conversationId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
  const data = await parseJsonResponse(res, "Failed to load DM conversation");

  return window.secureDm.importConversation({
    userId: currentUser.id,
    username: currentUser.username,
    conversation: data.conversation
  });
}

export async function sendDirectMessage({
  token,
  currentUser,
  conversationId,
  body
}) {
  const encryptedMessage = await window.secureDm.createMessage({
    userId: currentUser.id,
    username: currentUser.username,
    conversationId,
    senderUserId: currentUser.id,
    plaintext: body
  });

  const res = await fetch(`${CORE_API_BASE}/dm/messages/send.php`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(encryptedMessage)
  });

  return parseJsonResponse(res, "Failed to send DM");
}

export async function pullRelayMessages({ token, currentUser }) {
  const device = await window.secureDm.getDeviceBundle({
    userId: currentUser.id,
    username: currentUser.username
  });

  const relayRes = await fetch(
    `${CORE_API_BASE}/dm/relay/pending.php?deviceId=${encodeURIComponent(device.deviceId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
  const relayData = await parseJsonResponse(relayRes, "Failed to load relay messages");
  const imported = [];

  for (const item of relayData.items) {
    let message;

    try {
      message = await window.secureDm.receiveMessage({
        userId: currentUser.id,
        username: currentUser.username,
        conversationId: item.conversationId,
        relayItem: item
      });
    } catch (error) {
      await importRemoteConversation({
        token,
        currentUser,
        conversationId: item.conversationId
      });

      message = await window.secureDm.receiveMessage({
        userId: currentUser.id,
        username: currentUser.username,
        conversationId: item.conversationId,
        relayItem: item
      });
    }

    imported.push(message);

    await fetch(`${CORE_API_BASE}/dm/relay/ack.php`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        relayId: item.relayId,
        deviceId: device.deviceId
      })
    });
  }

  return imported;
}
