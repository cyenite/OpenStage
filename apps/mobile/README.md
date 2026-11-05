# Mobile and companion apps (Flutter)

Placeholders for phase 2 (blueprint section 6). Each app is a client of the desktop engine over the
network protocol (pairing by QR code, per-device token with a role); none of them holds show data of its own.

| Folder | App | Role on pairing |
|---|---|---|
| `remote/` | Operator remote for phones and tablets: service order, Preview/Live, next/previous, layer clears | Operator |
| `stage/` | Stage display for tablets and TVs on stage: current and next slide, notes, clocks, stage messages | Stage viewer |
| `congregation/` | Phones in the pews: current lyrics or scripture in the reader's language, font size, giving details | Audience |

Dart models will be generated from the TypeScript protocol in `packages/shared`, so the wire format has
one source of truth. The congregation app also needs a no-install web version (blueprint 5.2).
