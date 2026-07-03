# Письмо мейнтейнеру cslans.com

Отправить на контактный email с сайта (или в DM [@RobuJohnson](https://x.com/RobuJohnson) /
[@CS2LANS](https://x.com/CS2LANS)). Cslans сам приглашает: «Want to partner up? Don't hesitate
to contact me». Курируемый фид от дружелюбного мейнтейнера надёжнее любого скрейпера —
скрейпинг у нас fallback, а не отношения.

---

Subject: LAN visa feasibility board built on cslans.com data — partnership?

Hi Roope,

I'm Amir, a CS student and CS2 player from Russia. I built a small utility on top of
your cslans.com catalog and wanted to ask for your blessing (and ideally a stable feed).

The site answers one question for players with Russian passports: "can I still get a
Schengen visa in time for this LAN?" It takes your tournament list, overlays per-country
visa status for RF citizens (which countries still issue visas, transit bans, processing
times) and shows a feasibility countdown per event.

How I use your data today:
- a scheduled job fetches your tournament list once every 8 hours (single HTTP request,
  identifiable User-Agent with my contact email), normalizes it and commits a snapshot;
- the site is fully static — no request ever hits cslans.com from my visitors;
- every tournament row links back to its page on cslans.com, and the board carries a
  visible "данные о турнирах: cslans.com" credit.

Asks:
1. Are you OK with this use? If not, I'll take it down, no questions.
2. If you are — would you consider exposing the dataset as a stable JSON/YAML file
   (even just a committed file in a public repo)? I'd happily consume that instead of
   parsing /js/data.js, and it would survive any refactor on your side.
3. If you ever want a "visa feasibility for RF players" column or link on cslans
   itself, the logic is open source and yours to reuse.

Site: <URL after deploy>
Source: https://github.com/TOKYOPEEK/lan-visa-board

Thanks for maintaining the best LAN catalog out there.

Amir
misirrro@gmail.com
