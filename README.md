# Ludo Game

A complete 4-player browser Ludo game implemented with vanilla HTML/CSS/JavaScript.

## Features
- 4 players (Red, Green, Yellow, Blue)
- Correct core Ludo rules:
  - roll 6 to enter token
  - exact roll to reach home
  - captures send opponent to yard
  - safe squares protect from capture
  - blockades (two same-color tokens) block movement
  - three consecutive sixes forfeit turn
  - extra roll on 6, capture, or reaching home
- Win condition: first player to move all 4 tokens home

## Run
Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.
