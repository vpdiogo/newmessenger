# Feature Verification

Use temporary local accounts and the running services from [Local development](setup.md).
Choose scenarios affected by the change; do not repeat every scenario for prose
edits. Record automated checks, real requests, simulations and unavailable checks
separately. Never run load tests or destructive cleanup against production.

## Automated and TCP Checks

Run the relevant commands listed in the [development guide](setup.md#checks-and-maintenance).
For HTTP/WebSocket changes, also verify the affected flow over real TCP; request
injection alone does not cover a real listener/upgrade. Do not log access tokens.

A representative messaging check uses two local users:

1. Register/login, verify `/auth/me`, and create a direct conversation.
2. Connect a recipient socket with `["bearer", accessToken]`.
3. Send over HTTP and verify persistence plus one `message.created` event.
4. Retry the same sender/client ID and confirm the original message ID, one
   stored history entry and no second event.
5. Check membership rejection and both history directions when affected.
6. Close clients and remove only the explicitly tracked temporary users and
   conversations created by the check, if cleanup is needed.

Payloads, pagination and close semantics are in [API and client contracts](../architecture/api-contracts.md).

## Authentication and Session Recovery

- Check registration boundaries, passphrases, whitespace/full-email rejection,
  field feedback, relevant-edit clearing and corrected submission. Exact accepted
  password text must log in; a different trimmed/normalized value must not.
- Preserve legacy 12-character login. Under a delayed request, fields/button
  must be disabled, busy/loading state exposed and repeated activation must
  produce one request. Failure restores controls and values; retry succeeds.
- With a stored session and a non-first conversation URL including extra query
  and hash values, simulate an unavailable `/auth/me` and reload. Keep the token
  and URL, expose **Retry**, and render no dashboard. Restore the API and retry.
- An actual verification `401` must clear the token and redirect to login;
  network/rate/server/malformed-success failures must preserve it. Do not describe
  session verification as email-ownership verification.

## Selection, Discovery and Lifecycle

- Reload a non-first selection; use Back/Forward, invalid IDs and an empty list.
  Keep unrelated query/hash values and preserve a requested URL on list failure.
- Refresh or select the same conversation with a draft: retain text/transcript
  and show existing contacts during refresh/failure. Switch conversations during
  delayed sends/history requests; no response may update the wrong selection.
  Per-conversation draft retention is pending #58, not an implemented guarantee.
- Create a conversation and its first message remotely. The recipient discovers
  it without changing current selection/draft. Delay an in-flight list query to
  check grouped follow-up refresh. Creation without a message still needs manual
  **Refresh** while continuously connected.
- The conversation form rejects self-email case-insensitively, distinguishes an
  unknown participant, and clears obsolete input feedback independently of list
  errors. Check **Start a conversation**, **Start**, and **Close**.
- Leave and return to the dashboard while its old socket is closing. Old socket,
  request, scroll, discovery and announcement callbacks must not affect the new
  owner. Leaving the feature clears its in-memory state.

## Messaging, Retry and Scroll

- Enter sends exactly once, Shift+Enter inserts a newline, and the visible Send
  button works. Preserve focus. Empty/whitespace/oversized drafts, initial loading,
  pending sends, IME composition/confirmation and held Enter repeats must not send.
  Label simulated composition separately from a real operating-system IME check.
- After a simulated transient/lost-response failure, retry unchanged content with
  the original client ID. Editing uses a new ID and does not edit/cancel a stored
  message. A persisted message whose response was lost must not be duplicated.
- Check the 2,000 limit and correction. The current composer counts UTF-16 units
  while the API counts Unicode code points; see the documented discrepancy in
  [contracts](../architecture/api-contracts.md#conversations-and-messages).
- Open a conversation with more than 50 messages: begin at the latest page; load
  earlier history without moving the reading anchor. Receive near the end and
  while reading earlier content; only the former follows automatically. A local
  successful send reveals the end.
- Disconnect, send more than 50 messages from the other account and reconnect.
  Recover all missed history without duplicates or skipped messages while
  retaining scroll position. Provision enough distinct sender budgets, wait for
  expiry or use default-off quotas rather than weakening enabled quota tests.

## Layout, Keyboard and Announcements

- Check login/register default views at 1150 × 682 and a larger viewport. Errors,
  smaller heights and zoom may require scrolling; no guidance/control may be
  clipped. Check labels, autocomplete, keyboard navigation, normal/forced-colors
  focus and busy state before, during and after failure.
- At 1150 × 682 with a long email, check connecting/connected/disconnected status
  on one line, plus the capacity state when enabled. Open the conversation form
  with no error, creation error, refresh error and both errors. Keep two complete
  contact rows, input/actions and feedback reachable without page scrolling at
  the normal desktop reference. Smaller/zoomed views may scroll internally.
- Preserve independent transcript/list scrolling. Use Tab and Enter/Space for
  conversation buttons; only the selected item has `aria-current="true"`. Full
  participant names remain accessible when visually truncated; the participant
  heading names the central region, or **Conversation** with no selection.
- Using a real screen reader, verify polite incoming author/content announcements
  without focus movement. Initial/earlier history, own/other-conversation content
  stay silent; recovered incoming IDs are announced once. Identical text with new
  IDs remains announceable, and rapid arrivals can be batched.
- Verify stable lost/established connection announcements, suppress brief retry
  noise, cancel queued content on selection/disposal, and cancel generic automatic
  reconnect guidance when capacity recovery becomes manual. Hidden live regions
  must not change geometry. DOM/accessibility-tree checks do not prove spoken
  output or general WCAG compliance; report browser, screen reader and limitations.

## Optional Abuse Controls

Use the actual thresholds and enabled/disabled contracts in
[API abuse protection](../architecture/api-abuse-protection.md). Changing a local
backend environment switch requires restarting the server.

- HTTP: exhaust 20 conversation attempts/hour or 60 message attempts/minute for
  one user. Include existing-pair and unchanged retries. Check `429`, positive
  `Retry-After`, `no-store`, unchanged reads/session verification and original-ID
  retry after cooldown. Verify bounded-state `503` in deterministic tests and
  the always-active 32 KiB body limit with either switch state.
- WebSocket: open six same-user dashboard tabs. Five remain accepted; the sixth
  receives `4008` and stops retries. Other users/tabs remain functional. HTTP
  sending and selection/draft state stay usable while limited.
- Make one guarded manual attempt, including repeated activation while pending.
  Another `4008` stops again. Close an accepted tab and manually retry; recover
  fresh history/discovery once. An `open` before refusal may run HTTP recovery,
  so add new data after a refused attempt to verify the final successful recovery.
- Test close/error/shutdown cleanup, independent users/instances, disposal and
  ordinary automatic reconnect. With the switch disabled, more than five valid
  connections are accepted; authentication still applies.

Label clock advancement, delayed responses/handshakes and injected errors as
simulations. Record actual browser zoom separately from CSS zoom or reduced-
viewport equivalents. Activation, monitoring and rollback are owner actions in
[production guidance](../deployment/production.md#activate-or-disable-abuse-controls).
