# 05 — Tinker

## Prediction

I predicted the behavior from `src/App.js` before observing any browser network activity.

### Same mood clicked five times fast

- The first click sets `loading` to `true`, stores the mood in `lastFetchRef`, and schedules one `setTimeout`.
- Subsequent clicks with the same mood return early because of:
  `if (lastFetchRef.current === mood && loading) { return; }`
- Prediction: only one batch of 5 image requests should fire after the 600ms delay.

### Different moods clicked five times fast

- Each click cancels the previous `AbortController`, but the code does not cancel the previous `setTimeout`.
- Each click schedules another delayed update for a new set of image URLs.
- Prediction: the network tab should show 5 batches of 5 image loads, one per mood, arriving in sequence.
- The final rendered mood should be the last click, but stale callbacks could still briefly overwrite earlier results.

## Actual behavior observation

- I could not directly open the browser network tab from this editor environment.
- Based on the implementation, the critical gap is:
  - The code intends to cancel previous work with `AbortController`.
  - In reality, there is no cancelable async fetch; the old timeout still completes.
- So the likely gap is that the network request pattern behaves like image reloads triggered by each state update, even though the abort logic suggests an earlier request would be canceled.

## Gap summary

- Intended behavior: abort previous mood load when a new mood is selected.
- Actual behavior: older delayed callbacks still update state, causing multiple image batches and potential stale UI updates.
- This mismatch is the real issue to fix.
