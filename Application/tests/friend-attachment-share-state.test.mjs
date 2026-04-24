import assert from "node:assert/strict";

import {
  collectShareIdsFromMessageCollections,
  createRequestedAttachmentTransferState
} from "../src/features/friends/attachmentShareState.js";

assert.deepEqual(
  collectShareIdsFromMessageCollections(
    [
      {
        attachments: [
          { shareId: "share_direct" },
          { shareId: "share_dupe" },
          { transferId: "file_1" }
        ]
      }
    ],
    [
      {
        attachments: [
          { shareId: "share_group" },
          { shareId: "share_dupe" }
        ]
      }
    ]
  ),
  ["share_direct", "share_dupe", "share_group"]
);

assert.deepEqual(
  createRequestedAttachmentTransferState("demo.txt"),
  {
    status: "requesting",
    progress: 0,
    fileName: "demo.txt",
    error: ""
  }
);

console.log("friend-attachment-share-state.test.mjs: ok");
