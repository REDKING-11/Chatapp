## Do Later

- Consider migrating closer to a Signal-style protocol structure if you want stronger long-term E2EE claims.  
  Problem: Custom crypto designs are risky over time, even if the current primitives are good.  
  How to fix: Either align much more closely with a proven protocol design or reuse a well-vetted library/protocol model.

- Add third-party cryptographic review or audit before making very strong public claims.  
  Problem: Without outside review, “true E2EE” claims should still be carefully worded.  
  How to fix: Get a focused protocol and implementation review once the DM design stabilizes.

- Add more advanced metadata protections if your architecture allows it.  
  Problem: E2EE protects content, not all metadata.  
  How to fix: Later, consider delivery obfuscation, contact-discovery minimization, and metadata retention limits.

- Add hardened secure export/import for encrypted conversation backups.  
  Problem: Export flows can become the weakest link if backup packages are too easy to misuse.  
  How to fix: Use passphrase-based or recipient-device-wrapped backup encryption with strong warnings and verification.

- Add transparency-style logs or advanced trust-change alerts if the system grows.  
  Problem: At larger scale, silent key changes become a bigger trust issue.  
  How to fix: Add stronger auditability for key lifecycle events.

## You Can Do These, But They’re Not Really Necessary

- Cosmetic crypto naming cleanups in docs and UI.  
  Problem: Mostly presentation only.  
  How to fix: Rename terms once the actual security model is stable.

- Fancy trust indicators before the underlying verification flow is fully implemented.  
  Problem: This can create false confidence.  
  How to fix: Keep UI simple until fingerprints, signatures, and device verification are real.

- Very advanced deniability or anonymity features this early.  
  Problem: They add complexity before the core E2EE trust model is finished.  
  How to fix: Leave them for much later.

- Over-optimizing local encrypted storage formats before the trust model is finished.  
  Problem: [Application/src/main/dm/storage.js](/C:/Users/REDKING/Projects/Chatapp/Application/src/main/dm/storage.js) is already serviceable.  
  How to fix: Prioritize trust, protocol, and key-management work first.

- Marketing-language upgrades before the protocol and verification flow are solid.  
  Problem: Overclaiming is a security risk in itself.  
  How to fix: Keep public claims conservative until the DM path is mature.

## Do Mayby

- Encrypt more attachment metadata like file names where practical.  
  Problem: The DM service normalizes attachment metadata in plaintext structures. Even if file bytes are encrypted later, names and MIME types may still leak.  
  How to fix: Put filenames and sensitive metadata inside the encrypted message body whenever possible.

- Add clearer audit trails for device addition, revocation, and trust changes.  
  Problem: Users cannot easily reason about account/device trust without visible history.  
  How to fix: Add human-readable device-event history in client settings.