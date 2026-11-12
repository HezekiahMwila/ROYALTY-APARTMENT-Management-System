# Royalty Apartments

Management website for a 24-room university boarding house.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000. The first visit shows a one-time setup page where you create the admin account.

Needs Node.js 22.13 or newer (uses the built-in SQLite). Set `PORT` to change the port.

## Hosting on Render

`render.yaml` sets the site up on Render's **free plan**, which is for demos only: every restart or update empties the database and the uploaded screenshots, and the site sleeps after 15 minutes without visitors. The file explains how to switch to a paid plan with a permanent disk.

Online, the first-time setup page is switched off so a stranger cannot claim the admin account. The admin is created from the `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `ADMIN_NAME` settings in Render instead.

## What it does

**Students** register with their name, phone number, email and a password, then log in with their phone number. The caretaker (admin) assigns their room. They get a welcome homepage with apartment photos and services, a My room page with their profile picture, and can submit rent payments (screenshot required), report room problems (with an optional photo) and rate their roommates out of 5 stars.

**Admin** sees all 24 rooms at a glance, edits occupants (add, move, remove, edit details, reset passwords), approves or rejects payments after viewing the screenshot, tracks problem reports, sees roommate ratings, and sets the rent per room plus the payment instructions students see. In Settings the admin also uploads the homepage photos and edits the welcome message and list of services.

Bedspaces per room are fixed in `db.js`: Room 2 has 4, Room 4 has 3 and every other room has 2. Room 1 is **Reserved** (not available to students); change `RESERVED_ROOMS` in `db.js` to alter that.

A room shows as **Vacant** automatically when nobody is registered in it. The admin can also empty a room with **Mark vacant** on the room's page.

## Where things live

- `server.js` – all routes and logic
- `db.js` – database tables (SQLite)
- `views/` – pages (EJS templates)
- `public/style.css` – styling
- `data/` – created on first run: the database (`royalty.db`) and uploaded images. **Back this folder up**; deleting it resets the site.
