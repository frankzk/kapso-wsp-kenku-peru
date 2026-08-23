# Bug report — Kapso Meta proxy strips the BSUID country prefix

**Project:** Kenku Peru (`cf65efcf-38ab-475c-85b3-c2b89f304652`)
**Endpoint:** `POST https://api.kapso.ai/meta/whatsapp/v24.0/{phone_number_id}/messages`
**Impact:** every free-form message we send through the API to a username-only
contact fails with Meta error `131026 Message undeliverable`. The customer
receives nothing. Kapso's own internal channels reach the same contact fine, so
this is specific to the proxy endpoint.

## What happens

Contacts that reach us through a WhatsApp username (CTWA ads, no phone number)
have `phone_number: null` and a `business_scoped_user_id` such as
`PE.948592654941065`.

The proxy accepts the BSUID in `to` — it resolves it well enough to validate the
24-hour session window. But when it dispatches to Meta it **drops the country
prefix** and sends `948592654941065` as if it were a phone number. Meta then
returns `131026`.

The response echoes the truncation:

```json
{"contacts":[{"input":"PE.948592654941065","wa_id":"948592654941065"}], ...}
```

and the resulting message id decodes to the phone-number form
(`HBgP` + `948592654941065`) instead of the user-id form
(`HBgS` + `PE.948592654941065`).

`to` is the only recipient field the proxy accepts. We probed
`to_user_id`, `business_scoped_user_id`, `bsuid`, `recipient_user_id`,
`to_parent_user_id`, `username`, and `recipient_type: "user_id"` — all return
`400 {"error":"recipient phone number or BSUID missing"}`. So there is no way to
address these contacts correctly from the public API.

## Reproduction

Conversation `dcb5c4f5-730f-4906-a1a6-6639602ff902`, phone number id
`1239315459260256`, contact BSUID `PE.948592654941065`. Within the same
conversation, minutes apart:

| Sent by | Recipient recorded | Result |
|---|---|---|
| Proxy endpoint (`to: "PE.948592654941065"`) | `recipient_id: "948592654941065"` | `failed`, error `131026` |
| Workflow `send_text` node | `recipient_user_id: "PE.948592654941065"` | `delivered` / `read` |
| Agent `send_media` tool | `recipient_user_id: "PE.948592654941065"` | `read` |

Note the field name also differs: the failing sends report `recipient_id`, the
working ones report `recipient_user_id`.

## What we expect

When `to` carries a BSUID, the proxy should forward it to Meta using user-id
addressing (preserving the `PE.` prefix), the same way the workflow nodes and
the built-in agent tools already do.

## Scope on our side

We currently have 27 username-only conversations with real inbound customer
messages. Every free-form reply we sent them through the proxy failed. Our
workaround is to stop using the proxy for these contacts and route them through
`send_notification_to_user` instead, but that bypasses our outbound content
validation, so we would rather fix the addressing.
