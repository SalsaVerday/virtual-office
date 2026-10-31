# Sideload the Teams tab

The package is a static tab named **Join standup**. Its content URL is the staging office with `?zone=standup&entry=teams_tab`, which opens the map and teleports onto the standup circle. `websiteUrl` is the same link, for "Open in browser".

This repo does not upload the app and does not request admin consent. Those are done in the Teams admin center by the person who owns the tenant.

## Build the zip

From the repo root, after the staging URL exists:

```bash
./scripts/package-teams.sh https://<preview-host>
```

`https://<preview-host>` replaces the `STAGING_URL` placeholder in `teams/manifest.json`. The script checks the filled manifest against the Teams 1.19 rules this package uses (GUID, https URLs, the standup query, `validDomains`, and the icon filenames) and writes:

```text
teams/dist/virtual-office-teams.zip
```

That directory is gitignored. The zip contains `manifest.json`, `color.png`, `outline.png`, and `color32x32.png` at the root of the archive. The manifest references `color.png` (192×192) and `outline.png` (32×32 white on transparent). Schema 1.19's `icons` object does not have a `color32x32` field, so that file is in the zip only.

Do not commit the filled manifest or the zip. The file in git keeps the placeholder.

## What Alexzander does in Teams

1. Open [admin.teams.microsoft.com](https://admin.teams.microsoft.com).
2. **Teams apps** → **Manage apps** → **Upload new app** → **Upload a custom app**.
3. Choose `teams/dist/virtual-office-teams.zip`.
4. If the tenant asks for admin consent for the app's `identity` permission, grant it there. This checklist does not grant it.
5. Assign the app (setup policies, or **Teams apps** → the app → **Users and groups**) so the people who should see the tab can add it.
6. In the Teams client: **Apps** → **Manage your apps** → the uploaded app → **Add**. The personal tab is **Join standup**.

A custom-app upload in the client (**Apps** → **Manage your apps** → **Upload an app** → **Upload a custom app**) only works when the tenant's app setup policy allows it. Prefer the admin center upload when it does not.

The Azure app registration from `docs/staging-setup.md` is separate. The tab does not complete Microsoft sign-in by itself. People who open the tab on a staging build that still uses the dev name form sign in with that form. Production Azure sign-in is the later switch of `VITE_AUTH_PROVIDER`.

## Deep link

```text
https://<preview-host>/?zone=standup&entry=teams_tab
```

`zone` accepts a zone type (`standup`, `lounge`, `meeting`, `squad`) or a zone name (`Standup`, `Meeting 1`). The avatar lands on the center of that rectangle. `entry=teams_tab` is stored on the session event so usage can tell a tab open from a normal visit.
