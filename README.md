# ErnieTech's Astro Planner for 'Smart Scope' users!

**Here's the question: What can I image tonight with my little 'smart scope', from *my* yard, in the couple of hours I have?**
---
Astro Planner is a small, invite-only web app for finding deep-sky object candidate for imaging with smart scopes like the Dwarf Mini, Dwarf 3, Seestar S30/S50 or other.  

Most planning tools assume a dark site and an open horizon. In a light-polluted city or suburban backyard you might have one little clear 'sky box' between the houses and the trees, and maybe a couple of hours after dinner to use your smart scope. So the question really isn't "what's up tonight?" but "what will be in *that* little 'sky box' long enough to capture the multiple images needed for successful stacking - and is the selected object bright enough to be worthwhile?" Astro-Planner answers exactly that question.  

All you need to do is describe that 'box' of sky you can actually see from your yard - what direction, how wide, how tall and high above the horizon the box starts and the hours of your evening imaging session. Astro-Planner will list the Messier, NGC and other objects that will stay in that window for the time you need to do a successful imaging session.  
---
Every member of the ErnieTech's Astro-Imaging group maintains their own imaging log - and that log is used by the planner so you can see at a glance what you've already captured and what's still waiting. It's a completely free, invite-only web app built for astronomy-minded people. It sports an unapologetically 1990s Windows Vista desktop retro-look, including a red night-vision mode for use at the telescope.

<img width="956" height="780" alt="image" src="https://github.com/user-attachments/assets/a95de790-25c7-4fc2-92bc-821f0e52a97b" />

## Astro-Planner's Main Features -

**Planning**
- **Your own sky box.** Set the azimuth and altitude range you can actually see. Windows that cross north, such as 330° to 30°, work too.
- **Time in the window.** Each object's path is computed minute by minute across your session. An object is listed only if it stays inside your box for the minimum time you choose, from 30 minutes to 2 hours.
- <img width="941" height="189" alt="image" src="https://github.com/user-attachments/assets/a1dd59be-3da0-497f-a15b-f1efe7048a52" />  
- **Brightness limit**, plus a "just past your limit" list of objects up to 1.5 magnitudes fainter.  
- <img width="940" height="144" alt="image" src="https://github.com/user-attachments/assets/2f577c90-a49f-4d16-9cfb-14a71aba326e" />  
- **Sky box chart** showing your window and each target's track across it, with 30-minute markers.
- **Target List** of Candidate of all the object that will be in your Sky Box during your session  
- **RA and Dec everywhere.** Each target shows J2000 coordinates, the window's RA/Dec footprint is shown at the start and end of the session, and pointing at the chart reads out RA/Dec at that spot.  
- <img width="938" height="324" alt="image" src="https://github.com/user-attachments/assets/591e2bbf-2f4d-43b1-9ecb-fcdd60b5ca82" />
- **Prev / Tonight / Next** buttons to scan ahead through the season.  

**Logging**
- An **imaging log** for each member: date, object, site, number and length of subs, gain, filter, sky conditions, a star rating and notes.
- Totals per object, with search and **CSV export**.
- The planner marks every target "Not yet" or "1 h 15 m · 2 sessions", and can sort the ones you haven't imaged to the top.

**Accounts**
- **Invite-only.** The admin creates single-use invite links; there's no public sign-up.
- **Multiple sites per member**, each with its own location, time zone, sky box and Bortle class, plus a **Use My Location** button.
- Settings follow you between devices.
- Works on phones and desktops.

**At the telescope**
- **Red Light mode** turns the whole interface black and red to protect your night vision.

<img width="956" height="780" alt="image" src="https://github.com/user-attachments/assets/df34f5b6-3462-48f0-af03-389272339cca" />

## How Astro-Planner works -

1. Catalog positions are Epoch J2000 processed to the desired session date.
2. For every minute of the session, local sidereal time gives each object's hour angle, which converts to altitude and azimuth for the site.
3. The app finds each object's longest continuous run inside the user's defined sky box and keeps those that meet the minimum time and magnitude limit.
4. For the Right Ascension/Declination (RA/Dec) readouts, the sky box's edges are converted the other way, from alt/az back to Epoch J2000 RA/Dec.
5. Everything runs in your Chrome/Firefox/Edge or other browser. No external services, apps or local helpers are needed.
6. The approximations (simple precession, no refraction, no nutation) are accurate to well under a degree!
7. The server stores each site, settings and log data.

## The Tech Stack -

- **Backend:** Python 3.9+, [Flask](https://flask.palletsprojects.com/), SQLite (a single file), gunicorn
- **Frontend:** plain HTML, CSS and JavaScript.
- **Hosting:** any Linux server using nginx or Caddy web services. Installs and runs on a small VPS like the Hetzner Cloud VM with HTTPS from Let's Encrypt.
- **Dependencies:** `flask`, `gunicorn`, `tzdata`. That's all.

## Quick start (local)

```sh
git clone <this repo>
cd astro-planner
python3 -m venv venv
. venv/bin/activate                # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py create-admin yourname --name "Your Name" --lat 40.08 --lon -75.08
flask --app app run --debug
```

Run locally from the server - http://127.0.0.1:5000 and sign in, or run remotely from https://'yourdomain':5000, click **Admin**, then **Create Invite** to add another account.

## Deploying

The [Administrator's Guide](ADMIN.md) covers the full production setup step by step:

- systemd service, nginx reverse proxy and HTTPS with certbot
- inviting and managing members
- **backups:** nightly server bundles (database, settings and a manifest with an integrity check), an automatic nightly pull to a Windows PC, and an on-demand **Download Backup** button
- **restores:** a one-command restore that checks the backup first and can be undone, plus rebuilding on a new server and a restore drill
- updating, troubleshooting and a quick-reference command card

## Project layout

```
/opt/astro-panner
app.py                    Flask app: pages and JSON API
db.py                     SQLite schema and helpers
manage.py                 Admin CLI: invites, users, password resets, backup, verify
static/
  astro.js                Catalog and sky math
  app.js                  Browser UI
  retro.css               The retro theme and red-light mode
templates/                Main page, sign-in and sign-up
deploy/
  astro-planner.service   systemd unit
  backup.sh / restore.sh  Nightly backup bundle and one-command restore
  windows/                PowerShell scripts that pull backups to a PC
ADMIN.md                  Administrator's Guide
venv/                     All the Python stuff
```

## Security

- Passwords are encrypted.
- Every query is unique to the signed-in user - who never see each other's sites or logs.
- CSRF tokens on forms, a custom-header check on API writes, rate-limited sign-in, and HTTP-only, SameSite, HTTPS-only session cookies.
- The app runs as an unprivileged system user and listens only on localhost behind the reverse proxy.

## Roadmap

- In-app **Help** window
- Horizon profile (obstruction height every 10° of azimuth) instead of a rectangular box
- Moon phase and Moon separation for each target
- Surface-brightness filtering alongside total magnitude
- Larger catalogs (Caldwell, Sharpless)
- Thumbnails on log entries

## Issues or problems?

Found a problem? Please open an issue rather than posting details publicly.

## Version history

| Version | Date | Changes |
|---|---|---|
| 1.1.0 | 2026-10-19 | Download Backup button; backup bundles with settings and manifest; restore script; Windows backup pull; `manage.py verify`; Administrator's Guide |
| 1.0.0 | 2026-10-17 | First release: accounts and invites, sites, planner, imaging log, retro UI |

## Author

Dave Doler K3DFD, Philadelphia. Pa. k3dfd.radio@gmail.com

## License

MIT
