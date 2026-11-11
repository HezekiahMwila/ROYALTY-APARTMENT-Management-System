# Royalty Apartments

Management website for a 24-room university boarding house.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000. The first visit shows a one-time setup page where you create the admin account.

Needs Node.js 22.5 or newer (uses the built-in SQLite). Set `PORT` to change the port.

## What it does

**Students** register for a room with free beds, submit rent payments with a screenshot, report room problems (with an optional photo) and rate their roommates out of 5 stars.

**Admin** sees all 24 rooms at a glance, edits occupants (add, move, remove, edit details, reset passwords), approves or rejects payments after viewing the screenshot, tracks problem reports, sees roommate ratings, and sets beds/rent per room plus the payment instructions students see.

A room shows as **Vacant** automatically when nobody is registered in it. The admin can also empty a room with **Mark vacant** on the room's page.

## Where things live

- `server.js` – all routes and logic
- `db.js` – database tables (SQLite)
- `views/` – pages (EJS templates)
- `public/style.css` – styling
- `data/` – created on first run: the database (`royalty.db`) and uploaded images. **Back this folder up**; deleting it resets the site.
