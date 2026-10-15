# ONE80 Gate Agent 1.1.0 — online QR authorization

This release replaces the 1.0 full-table synchronization workflow. It **never
writes or deletes controller users, fingerprints, timezones or authorizations**.
It reads Pull SDK events, sends a live unregistered-card event (27) to ONE80,
and pulses only the configured relay after the API approves membership and
records attendance. Events 0/1 report a grant already made by the controller;
they do not cause an additional pulse. Stale/replayed lookups cannot open a door.

## Install on the gym Windows PC

1. Deploy backend and frontend together first.
2. In Gate Access, edit the existing controller. Select the actual panel model,
   IP/port, entry relay and optional exit relay (0 means entry only). One relay
   for both directions requires panel reader direction metadata.
3. On creation, download `one80-gate-setup.json`. For an existing record whose
   saved key is lost, issue a new key once and download the file. Existing keys
   need not be rotated when editing IP/model/relays.
4. Extract this package. Put `one80-gate-setup.json` beside the installer.
5. Right-click `Install-One80GateAgent.cmd` → Run as administrator.
   It validates outbound HTTPS authentication and SDK panel identity before
   installing the scheduled task. It does not change the PC timezone or panel
   network settings. Keep Windows date/time correct.
6. Confirm a fresh heartbeat in Gate Access, then physically scan a member QR.

The saved secret is under `%ProgramData%\ONE80\GateAgent\config.json`, restricted
to SYSTEM and administrators. Protect/remove the downloaded setup file after
successful installation; it contains the same secret. Do not send it in public
messages. The key authenticates the connector to ONE80; it is not the QR payload.

## Required hardware facts

Profiles: C3-200 (2 relays), INBIO160-PRO (1), INBIO260-PRO (2).
These are **Pull SDK profiles**, not a promise that all Pro firmware supports the
bundled legacy DLL. Firmware must expose Pull communication and live events.
The installer refuses an absent or different `~DeviceName`, including MB20.
A matching model is connection evidence; only a physical scan validates QR decoding,
reader direction, event delivery, panel behavior, and turnstile wiring.

QR50BE is the reader. HST-TP-312 in the supplied photo identifies the mechanical
turnstile, not the network controller. 192.168.1.201 previously identified as MB20
must not be reused for an InBio profile without verifying the actual panel.
The QR must arrive as the same numeric credential displayed by ONE80. Verify
reader/panel Wiegand format and field mapping with the installer; never truncate
or silently transform a member QR to make it fit.

For online approval, a fresh unregistered member QR must reach the agent as
an event 27 with its numeric CardNo. If the panel does not report that event,
or only supports PUSH/ADMS, stop: this Pull connector cannot fulfill that firmware
path. Do not change firmware, reset the device, or disable security blindly.
Existing panel-authorized cards may still open locally; the agent preserves them.
Internet/ONE80/Windows connectivity is required for newly authorized QR opening.
Keep the existing physical exit mechanism operational.

## Acceptance — do on site

- Correct panel model/serial read by SDK, fresh heartbeat visible.
- Active member QR: correct credential in events, one physical opening, one visit.
- Expired/revoked/unknown QR: denied; no physical opening.
- Exit reader (if fitted): correct direction/checkout, no entry counted as exit.
- Disconnect/reconnect API: no delayed door openings from old commands/scans.
- Existing staff device users remain intact.

`Run-One80GateCheck.cmd` makes a redacted read-only diagnostic report.
For a read-only authenticated SDK/model probe, run the installed script with
`-ConfigPath "$env:ProgramData\ONE80\GateAgent\config.json" -ProbeOnly`.
Do not run a second probe/session while the installed agent owns the controller;
use the installer's initial preflight or coordinate a maintenance pause.

## Validation boundaries

Source tests cover model/relay validation, branch isolation, active/expired QR
policy, stale scan/command rejection, setup export, and non-destructive agent
behavior. Native DLL execution, task registration and physical hardware need
Windows/on-site validation. No physical success is claimed by a passing build.
