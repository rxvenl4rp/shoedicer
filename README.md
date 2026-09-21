# SoleDuel

A two-player sneaker-collecting game: enter a shared code, then duel for each
other's shoes with a heads-or-tails call and a 6-color dice roll.

## How it plays

1. Both players join the same game code. Each starts with 3 random shoes.
2. Turns alternate. On your turn, you **call heads or tails** before a coin
   flips.
3. Guess right, and you choose to **call one of 6 colors** (red, orange,
   yellow, green, blue, purple) — or **pass**.
4. If you call a color, **4 dice roll together**, each landing on one of the
   6 colors. What happens depends on how many dice show your color:
   - **Land on it once** → you **steal a random shoe** from your opponent's
     shelf.
   - **Land on it zero times** → nothing happens, turn passes.
   - **Land on it twice or three times** → **rejected**. You immediately
     have to call a different color and roll again, same turn.
   - **Land on it on all four dice** → **jackpot** — you take your
     opponent's *entire* shelf in one shot.
5. Getting rejected twice in a row (two color calls in the same turn, both
   landing 2–3 times) is an instant loss — the match goes to your opponent.
6. Otherwise, first player to leave their opponent with zero shoes wins.

If any of that isn't quite the game you had in mind, the rules live in
`app.js` — the round logic is in the "Duel actions" section, so it's
straightforward to tweak (e.g. make it best-of-N rounds instead of
shoe-elimination, or change what a correct color call wins).

## Setup — you'll need your own free Firebase project

This game needs somewhere to sync moves between two players in real time.
Firebase's free tier ("Spark plan") covers this easily for casual play.

1. Go to **console.firebase.google.com** and create a new project (you can
   turn off Google Analytics for it, it's not needed).
2. In the project, click the **web icon (`</>`)** to register a new app.
   Give it any nickname. You don't need Firebase Hosting for this step.
3. Firebase will show you a config object that looks like:
   ```js
   const firebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     databaseURL: "...",
     projectId: "...",
     ...
   };
   ```
   Copy those values into `firebase-config.js` in this project, replacing the
   placeholder text.
4. In the left sidebar, go to **Build → Realtime Database → Create Database**.
   Start it in **test mode** for now (it's a casual game between friends, so
   this is fine — see the note on security below).
5. In the left sidebar, go to **Build → Authentication → Get started**, then
   enable the **Anonymous** sign-in provider. This is how the game tells two
   browsers apart without needing accounts or passwords.
6. Back in **Realtime Database → Rules**, paste this and click Publish:
   ```json
   {
     "rules": {
       "games": {
         "$code": {
           ".read": true,
           ".write": true
         }
       }
     }
   }
   ```
   This keeps everything scoped under `games/`, but it's wide open within
   that — anyone with a game code can read or write that game. That's the
   right tradeoff for a quick game with friends. If you want to lock it down
   further later, you can require `auth != null` (so only signed-in — even
   anonymously — clients can write) or add per-player checks.

That's it — no build step, no server code to write.

## Deploying to GitHub Pages

1. Push this folder to a new GitHub repository.
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", set **Source** to "Deploy from a branch",
   pick your main branch and the `/ (root)` folder, then save.
4. GitHub will give you a URL like `https://yourname.github.io/soleduel/`.
   That's the link both players open — one creates a game and sends the
   5-letter code to the other.

## Files

- `index.html` — page structure (lobby, waiting room, game screen)
- `style.css` — all styling
- `shoes.js` — the pool of collectible shoes and rarity odds
- `firebase-config.js` — **edit this** with your own Firebase project keys
- `app.js` — game logic: matchmaking, the coin/dice duel, shoe stealing

## Known limitations (fine for casual play, worth knowing)

- There's no reconnect/presence handling — if someone closes the tab
  mid-match, the game just waits for them silently. Refreshing and
  re-joining with the same browser works (their name/seat is remembered),
  but a fresh browser can't take over their seat.
- The player whose turn it is generates that round's coin flip and dice roll
  on their own device and writes the result. That's simple and works great
  between friends, but it isn't cheat-proof against someone editing their
  own client — there's no server-side authority. Adding one would mean
  Firebase Cloud Functions, which needs a paid (Blaze) plan.
- No shoe images — shoes are told apart by name, color tint, and a rarity
  border/glow. Swapping in real artwork just means editing the `.shoe-icon`
  rendering in `app.js` and `shoes.js`.
