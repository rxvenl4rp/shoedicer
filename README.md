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
