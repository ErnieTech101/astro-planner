# Astro Imaging Planner — Administrator's Guide

Version 1.1 · October 2026 · Dave Doler (K3DFD)

## About this guide

This guide is everything needed to run, back up, restore and rebuild the Astro Imaging Planner. The planner is an invite-only web app that lists the deep-sky objects each member can image from their own site and keeps their imaging log. It is written for the administrator (Dave) and for anyone who ever has to take over.

| Item | Value |
| --- | --- |
| Web address | https://astro-planner.ernietech.net |
| Server | Hetzner Cloud, Ubuntu (`ubuntu-4gb-fsn1-1`) |
| App code | `/opt/astro-planner` |
| Database | `/var/lib/astro-planner/planner.db` (one SQLite file, all members) |
| Settings and secret key | `/etc/astro-planner.env` |
| Web server | nginx site `/etc/nginx/sites-available/astro-planner`, HTTPS by certbot |
| App service | systemd unit `astro-planner`, listening on `127.0.0.1:8077` |
| Server backups | `/var/backups/astro-planner`, nightly at 3:17 am server time, kept 30 days |
| Local backups | Your Windows PC, pulled nightly (see Backups) |
| Admin account | `dave` (has the **Admin** button) |

Commands in this guide run on the server over SSH unless marked **Windows**. Lines starting with `sudo` need your server password.

## How it fits together

nginx receives every request and hands it to the app, which keeps all members' data in one database file. The app code and the data live in separate folders, so updating the code never touches anyone's data.

```
 Member's browser ──HTTPS──▶ nginx ──▶ App service (gunicorn :8077) ──▶ Database (planner.db)
                                                                              │ nightly 3:17 am
 Your Windows PC ◀──────── copied daily over SSH, 7:30 am ──────────── Server backups (30 days)
   (365 days)
```

| What | Where | Owned by |
| --- | --- | --- |
| App code (Python, pages, scripts) | `/opt/astro-planner` | `astro` |
| App's own Python packages | `/opt/astro-planner/venv` | `astro` |
| Database: members, sites, settings, logs, invites | `/var/lib/astro-planner/planner.db` | `astro` |
| Settings: secret key, database path, cookie setting | `/etc/astro-planner.env` | `root`, readable by group `astro` |
| App service definition | `/etc/systemd/system/astro-planner.service` | `root` |
| nginx site (HTTPS lines added by certbot) | `/etc/nginx/sites-available/astro-planner` | `root` |
| Nightly backup script | `/usr/local/bin/astro-planner-backup` | `root` |
| Backup schedule | `/etc/cron.d/astro-planner` | `root` |
| Server backups | `/var/backups/astro-planner` | `astro`, readable by group `astro` |
| Local backups | `Documents\Astro Planner Backups` on your PC | you |

`astro` is a system account that runs the app and owns its data. It can't log in. Your own account, `dave`, joins the `astro` group so it can read the backups.

## Installation record

These are the steps that built the live server, in order. Follow them again to build a replacement; when rebuilding from a backup, see Restoring first.

1. **DNS.** An A record for `astro-planner.ernietech.net` points at the server's IP address.
2. **Service account and folders.**
   ```sh
   sudo apt update && sudo apt install -y python3-venv sqlite3 nginx certbot python3-certbot-nginx
   sudo useradd --system --home /opt/astro-planner --shell /usr/sbin/nologin astro
   sudo mkdir -p /opt/astro-planner /var/lib/astro-planner /var/backups/astro-planner
   sudo usermod -aG astro dave        # lets your account read the backups
   ```
3. **App code and packages.** Upload the project folder to the server, then from inside it:
   ```sh
   sudo cp -r ./* /opt/astro-planner/
   cd /opt/astro-planner
   sudo python3 -m venv venv
   sudo ./venv/bin/pip install -r requirements.txt
   sudo chown -R astro:astro /opt/astro-planner /var/lib/astro-planner /var/backups/astro-planner
   sudo chmod 750 /var/backups/astro-planner
   ```
4. **Settings file.** Generate a secret key with `python3 -c "import secrets; print(secrets.token_hex(32))"`, then create `/etc/astro-planner.env`:
   ```
   AIP_SECRET_KEY=<the 64-character key>
   AIP_DB=/var/lib/astro-planner/planner.db
   AIP_SECURE_COOKIES=1
   ```
   Lock it down: `sudo chown root:astro /etc/astro-planner.env && sudo chmod 640 /etc/astro-planner.env`. Never change the key afterward; a new key signs everyone out.
5. **Admin account.**
   ```sh
   sudo -u astro env AIP_DB=/var/lib/astro-planner/planner.db ./venv/bin/python manage.py \
     create-admin dave --name Dave --callsign K3DFD --lat 40.08 --lon -75.08 --site-name "Fox Chase"
   ```
6. **Start the app.**
   ```sh
   sudo cp deploy/astro-planner.service /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable --now astro-planner
   curl -s 127.0.0.1:8077/healthz          # prints {"ok":true,"version":"…"}
   ```
7. **nginx site.** Create `/etc/nginx/sites-available/astro-planner`:
   ```nginx
   server {
       listen 80;
       listen [::]:80;
       server_name astro-planner.ernietech.net;
       location / {
           proxy_pass http://127.0.0.1:8077;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $remote_addr;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_set_header X-Forwarded-Host $host;
       }
   }
   ```
   Enable it: `sudo ln -s /etc/nginx/sites-available/astro-planner /etc/nginx/sites-enabled/`, then `sudo nginx -t && sudo systemctl reload nginx`.
8. **HTTPS.** `sudo certbot --nginx -d astro-planner.ernietech.net`, choosing to redirect HTTP to HTTPS. Certbot renews the certificate automatically.
9. **Backups.** Set up as described in Backups below.
10. **Check.** `curl -I https://astro-planner.ernietech.net` returns `302` to `/login`. Sign in from a browser.

## Members and invites

Members join only with an invite code, and each code works once. Most everyday admin happens in the app's **Admin** window; the rest uses `manage.py` on the server.

**Inviting someone (in the app).** Click **Admin**, type who it's for, and click **Create Invite**. Then click **Copy Sign-up Link** and send that link by email or text. It opens the sign-up page with the code already filled in. On first sign-in, the new member is asked to set up their site.

**Revoking an unused invite.** In **Admin**, click **Revoke** beside it. Used invites stay listed as a record of who joined with which code.

**Server commands.** These all start with the same long prefix, so set up a shortcut once by adding this line to the end of `~/.bashrc` on the server, then log out and back in:

```sh
alias aip='sudo -u astro env AIP_DB=/var/lib/astro-planner/planner.db /opt/astro-planner/venv/bin/python /opt/astro-planner/manage.py'
```

| To | Run | Notes |
| --- | --- | --- |
| List members | `aip users` | Log counts and last sign-in for each |
| List invites | `aip invites` | Shows who used each code |
| Make invite codes | `aip invite --note "for Josh"` | Add `-n 5` for five codes |
| Reset a forgotten password | `aip reset-password josh` | You type the new password; give it to them privately and they can change it under **Account** |
| Remove a member and all their data | `aip delete-user josh` | Asks you to type the name to confirm. Back up first; this can't be undone except by a restore |
| Make another admin | not built yet | Can be added if needed |

## Backups

Every night the server bundles the database and its settings into one file, and your PC copies the new bundle home the next morning. You can also download a copy any time from the app. That gives three places the data lives: the live server, 30 days of bundles on the server, and a year of bundles on your PC.

| Layer | When | Holds | Kept |
| --- | --- | --- | --- |
| Server bundle | Nightly, 3:17 am server time | Database, settings file (secret key), nginx site file, manifest | 30 days on the server |
| PC copy | Daily at 7:30 am, or when the PC next wakes | The same bundles | 365 days on your PC |
| **Download Backup** button | Whenever you click it | Database only | Wherever you save it |

Each bundle is named `planner-YYYY-MM-DD.tar.gz` and contains:

- `planner.db`: the whole database, copied safely while the app runs
- `astro-planner.env`: the settings file, including the secret key
- `nginx-astro-planner`: the nginx site file
- `MANIFEST.txt`: when it was made, an integrity check, and counts of members, sites and log entries

The bundles contain the secret key and every member's data, so treat the backup folder like a password file. Keep it in your own account and don't share it.

### Set up the server side (once)

1. Install the backup script and schedule it:
   ```sh
   sudo cp /opt/astro-planner/deploy/backup.sh /usr/local/bin/astro-planner-backup
   sudo chmod 755 /usr/local/bin/astro-planner-backup
   echo '17 3 * * * astro /usr/local/bin/astro-planner-backup' | sudo tee /etc/cron.d/astro-planner
   ```
2. Make the backups readable by your account, then log out and back in so the group change takes effect:
   ```sh
   sudo usermod -aG astro dave
   sudo chown astro:astro /var/backups/astro-planner && sudo chmod 750 /var/backups/astro-planner
   ```
3. Run one backup now and look inside it:
   ```sh
   sudo -u astro /usr/local/bin/astro-planner-backup
   ls -l /var/backups/astro-planner
   tar -xzOf /var/backups/astro-planner/planner-$(date +%F).tar.gz MANIFEST.txt
   ```
   The manifest should say `Integrity: ok` and show your member and log counts.

### Set up your Windows PC (once)

Your PC pulls the bundles over SSH, using a key instead of a password so it can run unattended. The server never connects to your PC.

1. **Make an SSH key** (skip if you already log in to the server without a password). In PowerShell: `ssh-keygen -t ed25519`, pressing Enter at each prompt to accept the defaults with no passphrase.
2. **Give the server your key.** In PowerShell:
   ```powershell
   type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh dave@astro-planner.ernietech.net "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
   ```
   Then `ssh dave@astro-planner.ernietech.net ls /var/backups/astro-planner` should list the bundles without asking for a password.
3. **Put the scripts somewhere permanent.** Copy the `deploy\windows` folder from the project to a folder that won't move, for example `Documents\Astro Planner Scripts`. The scheduled task runs the script from there.
4. **Do a first pull by hand.** In that folder:
   ```powershell
   powershell -ExecutionPolicy Bypass -File pull-backups.ps1
   ```
   It creates `Documents\Astro Planner Backups`, copies every bundle the server has, and ends with a line starting `OK:`.
5. **Schedule it:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File install-pull-task.ps1
   Start-ScheduledTask -TaskName 'Astro Planner Backup Pull'
   ```
   The task runs daily at 7:30 am. If the PC is off or asleep then, it runs as soon as the PC is next on.

**Checking on it.** Open `pull-log.txt` in the backup folder. Each run adds one line. `OK:` means all is well. `FAILED` means the PC couldn't reach the server. `WARNING` means the newest server bundle is more than two days old, so the nightly job has stopped (see Troubleshooting).

If your Documents folder is synced to OneDrive, the bundles are also copied to OneDrive. That's a useful extra copy off the PC, but it means your secret key is in your OneDrive too.

### Download Backup (any time)

Sign in as admin, click **Admin**, then **Download Backup**. Your browser saves `planner-YYYY-MM-DD-HHMM.db`, a complete copy of the database at that moment. Use it before risky changes, such as deleting a member or updating the app. It deliberately leaves out the settings file, so the secret key never travels over the web.

## Restoring

One script, `restore.sh`, puts any backup back in place. It checks the backup is intact before touching anything, asks you to type `yes`, and keeps the database it replaces, so every restore can be undone. A restore rolls back everyone's data to the moment of the backup, so anything members logged since then is lost.

### A: Roll back the live server

Use this after a bad delete or other mistake. Pick the newest bundle from before the problem:

```sh
ls /var/backups/astro-planner
sudo sh /opt/astro-planner/deploy/restore.sh /var/backups/astro-planner/planner-2026-10-19.tar.gz
```

The script prints the backup's manifest, asks for `yes`, stops the app, saves the current database as `planner.db.before-restore-<date-time>`, puts the backup in place, starts the app and checks that it answers. It ends with `Restore complete. The app is running.`

**To undo a restore**, run the same command on the saved copy:

```sh
ls /var/lib/astro-planner
sudo sh /opt/astro-planner/deploy/restore.sh /var/lib/astro-planner/planner.db.before-restore-20261019-091500
```

### B: Restore from a copy on your PC

Use this when the server's own bundles are gone or too new. **Windows**, in PowerShell, upload the bundle or a downloaded `.db` file:

```powershell
scp "$env:USERPROFILE\Documents\Astro Planner Backups\planner-2026-10-19.tar.gz" dave@astro-planner.ernietech.net:~
```

Then on the server: `sudo sh /opt/astro-planner/deploy/restore.sh ~/planner-2026-10-19.tar.gz`. A `.db` file from **Download Backup** works the same way.

### C: Rebuild on a new server

Use this if the server is lost.

1. Create a new Ubuntu server and follow the Installation record, steps 2, 3 and 6.
2. Upload your newest bundle from the PC and unpack it: `mkdir ~/restore && tar -xzf ~/planner-2026-10-19.tar.gz -C ~/restore`.
3. For step 4, use the saved settings instead of making new ones: `sudo cp ~/restore/astro-planner.env /etc/astro-planner.env`, then set its owner and permissions as in step 4. Keeping the old secret key means members stay signed in.
4. Skip step 5 (the admin account is in the backup). Restore the data: `sudo sh /opt/astro-planner/deploy/restore.sh ~/planner-2026-10-19.tar.gz`.
5. Point the DNS A record at the new server's IP address and wait for it to take effect.
6. Do steps 7 and 8 as written: the plain nginx site, then certbot for a fresh certificate. The saved `nginx-astro-planner` file is for reference only; its certificate lines point to files that exist only on the old server.
7. Set up backups again (Backups section) and delete `~/restore`, which holds the secret key.

### D: Restore drill (every few months)

A backup you have never restored is only a hope. This drill proves a bundle works by opening it on your PC, without touching the live server. **Windows**, Command Prompt, in your local copy of the app (the folder with `venv`):

```bat
mkdir C:\Temp\drill
tar -xzf "%USERPROFILE%\Documents\Astro Planner Backups\planner-2026-10-19.tar.gz" -C C:\Temp\drill
venv\Scripts\activate
python manage.py verify C:\Temp\drill\planner.db
set AIP_DB=C:\Temp\drill\planner.db
flask --app app run
```

`verify` should say `Integrity: ok`, with counts that match the server. Then open http://127.0.0.1:5000 and sign in with your normal password. You should see your real sites and log as of that night. Press Ctrl+C to stop, close the window, and delete `C:\Temp\drill`.

## Updating the app

An update replaces the code in `/opt/astro-planner` and restarts the app; the database is untouched. Take a backup first and keep the previous version, so you can roll back in a minute.

1. Upload the new project folder, unzipped fresh from the release zip, to your home directory on the server. Don't upload your Windows working folder: its Windows venv folder would overwrite the server's. These steps assume the folder is `~/astro-planner-new`.
2. Back up, and keep the current code:
   ```sh
   sudo -u astro /usr/local/bin/astro-planner-backup
   sudo rm -rf /opt/astro-planner.prev && sudo cp -a /opt/astro-planner /opt/astro-planner.prev
   ```
3. Copy the new code over the old (the `venv` folder stays):
   ```sh
   sudo cp -r ~/astro-planner-new/* /opt/astro-planner/
   cd /opt/astro-planner && sudo ./venv/bin/pip install -r requirements.txt
   sudo chown -R astro:astro /opt/astro-planner
   ```
4. If the update changed `deploy/backup.sh`, reinstall it: `sudo cp /opt/astro-planner/deploy/backup.sh /usr/local/bin/astro-planner-backup`.
5. Restart and check the version number: `sudo systemctl restart astro-planner && curl -s 127.0.0.1:8077/healthz`.
6. Sign in and click around. Members' browsers pick up the new pages automatically.

**To roll back**, put the previous code back and restart:

```sh
sudo rm -rf /opt/astro-planner && sudo mv /opt/astro-planner.prev /opt/astro-planner
sudo systemctl restart astro-planner
```

### Day-to-day checks

| How often | Check | Looking for |
| --- | --- | --- |
| Weekly | `pull-log.txt` on your PC | Recent `OK:` lines |
| Weekly | `aip users` | Members signing in; no strangers |
| Monthly | `sudo apt update && sudo apt upgrade`, then `sudo reboot` if asked | The app comes back on its own after a reboot |
| Monthly | `df -h /` | Disk under 80% full |
| Every few months | `sudo certbot renew --dry-run` | "Congratulations, all simulated renewals succeeded" |
| Every few months | Restore drill (Restoring, D) | Signing in to the restored copy works |

## Troubleshooting

Most problems come down to one of three things: the app isn't running, a setting is off, or the nightly backup stopped. Two commands show what the app is doing: `sudo systemctl status astro-planner` and `sudo journalctl -u astro-planner -n 50`.

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| **502 Bad Gateway** in the browser | The app isn't running | `sudo systemctl restart astro-planner`, then read the journal if it stops again |
| Sign-in page just reloads; can't stay signed in | Site visited over `http://` while `AIP_SECURE_COOKIES=1` | Use the `https://` address. If it still happens, check that the nginx site sets `X-Forwarded-Proto` |
| Everyone signed out after a restart | `AIP_SECRET_KEY` missing or changed in `/etc/astro-planner.env` | Put the original key back. It's in every backup bundle's `astro-planner.env` |
| "Too many failed attempts" | 10 wrong passwords from one address in 15 minutes | Wait 15 minutes, or `sudo systemctl restart astro-planner` to clear the counter |
| Member forgot their password | Forgotten password | `aip reset-password <name>` |
| "Invite code isn't valid" | Code already used, revoked or mistyped | Create a new invite and send the link rather than the code |
| A member's times look wrong | Wrong time zone on their site | They fix it under **Sites** (admins can't see members' sites) |
| `pull-log.txt` says **FAILED** | PC offline, SSH key not accepted, or `dave` not in the `astro` group | In PowerShell, try `ssh dave@astro-planner.ernietech.net ls /var/backups/astro-planner`; its error message names the problem |
| `pull-log.txt` says **WARNING ... days old** | Nightly backup job stopped | Run `sudo -u astro /usr/local/bin/astro-planner-backup` and read its error. Check that `/etc/cron.d/astro-planner` exists |
| Browser warns about the certificate | Automatic renewal failed | `sudo certbot renew`, then `sudo systemctl reload nginx` |
| "database is locked" in the journal | A backup and a write collided (rare; the app retries for 5 seconds) | Usually clears itself. Restart the app if it repeats |
| Planner shows the wrong objects for a member | Their sky box, location or magnitude limit | Check their site settings with them; the math runs in their browser |

## Security notes

The planner holds little that's sensitive: user names, optional names and callsigns, approximate observing locations, and imaging logs. It still protects them properly.

- **Passwords** are stored only as salted scrypt hashes. Nobody, the admin included, can read a member's password.
- **Privacy between members.** Every database query is limited to the signed-in member, so members can't see each other's sites or logs. The admin sees only names, callsigns, sign-in times and log counts.
- **Sign-in protection.** Forms carry anti-forgery tokens, and changes made through the app require a header other websites can't send. Sign-in is limited to 10 failures per 15 minutes per address.
- **Cookies** are HTTP-only, same-site and HTTPS-only, and stay valid for 90 days.
- **The secret key** signs everyone's sign-in cookie. Anyone holding it could pose as any member, so the settings file and the backup bundles must stay private.
- **Invite-only.** There is no public sign-up; each code works once.
- **Server.** The app runs as the locked-down `astro` account, can write only to its data folder, and listens only on the server itself; nginx is the only way in from outside.

## Quick reference

| Task | Command |
| --- | --- |
| Is the app running? | `sudo systemctl status astro-planner` |
| Restart the app | `sudo systemctl restart astro-planner` |
| Recent app messages | `sudo journalctl -u astro-planner -n 50` |
| Health and version | `curl -s 127.0.0.1:8077/healthz` |
| List members / invites | `aip users` / `aip invites` |
| New invite code | `aip invite --note "for Josh"` |
| Reset a password | `aip reset-password josh` |
| Back up right now | `sudo -u astro /usr/local/bin/astro-planner-backup` |
| List server backups | `ls -l /var/backups/astro-planner` |
| Check a backup | `tar -xzOf /var/backups/astro-planner/planner-2026-10-19.tar.gz MANIFEST.txt` |
| Restore a backup | `sudo sh /opt/astro-planner/deploy/restore.sh <bundle or .db file>` |
| Pull backups to the PC now (**Windows**) | `Start-ScheduledTask -TaskName 'Astro Planner Backup Pull'` |
| Test nginx after editing | `sudo nginx -t && sudo systemctl reload nginx` |
| Test certificate renewal | `sudo certbot renew --dry-run` |
