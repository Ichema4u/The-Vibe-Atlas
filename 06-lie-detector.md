# 06 — Lie Detector

## Five statements

1. The app uses a JavaScript `fetch` call to retrieve image metadata from the Picsum API.
2. `AbortController` is created and stored in `abortControllerRef` on every mood click.
3. Clicking the same mood five times fast is blocked by the duplicate request guard.
4. The loading delay is simulated with `setTimeout`, not forced by real network latency.
5. `ImageGrid` renders 10 placeholder skeleton cards while loading.

## Which statement is the lie?

- The lie is statement 5.

## Proof

- In `src/components/ImageGrid.js`, the loading state renders:
  ```js
  {
    Array.from({ length: 5 }).map((_, i) => <SkeletonLoader key={i} />);
  }
  ```
- That creates 5 skeleton cards, not 10.

## Verification of the true statements

- Statement 1 is false in code: there is no JS `fetch` call in `src/App.js`.
- Statement 2 is true: `abortControllerRef.current = new AbortController();` runs for each new load.
- Statement 3 is true: `if (lastFetchRef.current === mood && loading) { return; }` prevents duplicate mood requests.
- Statement 4 is true: the app uses `setTimeout(() => { setImages(...); setLoading(false); }, 600);`.

## Conclusion

The lie is the numeric claim about skeleton cards. The code clearly renders 5 placeholders during loading.
