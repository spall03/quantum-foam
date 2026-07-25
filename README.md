# Quantum Foam

A playable browser prototype of the Quantum Foam game design.

Dispatch photons into a hidden maze, find energy nodes, and carry fragile observations
back to confirmed waystations. Confirmed routes become permanent and free to traverse.
If a photon dies, its undelivered map disappears and that part of the maze rerolls.

## Play

Open the [live GitHub Pages build](https://spall03.github.io/quantum-foam/).

- Move with arrow keys or WASD.
- Swipe on the maze on touch screens.
- Switch photons with 1, 2, or 3 while parked at a waystation.
- Confirm 50% of the grid, find the hidden exit on the frontier, and step through.

## Local use

Serve this folder with any static web server and open `index.html`. There are no runtime
dependencies and no build step.

Run the logic checks with:

```sh
npm run check
```

All tuning values are collected in the `CONFIG` object at the top of `core.js`.
