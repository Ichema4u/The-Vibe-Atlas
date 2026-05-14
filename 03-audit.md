# Vibe Atlas - Security, Performance & Accessibility Audit

---

## 1. 🔐 API Key Exposure - SECURE ✅

### Finding

No API keys are hardcoded or exposed in the code.

### Current Implementation:

```javascript
const urls = Array.from(
  { length: 5 },
  (_, i) => `https://picsum.photos/400/300?random=${mood}${i}${Date.now()}`,
);
```

### Analysis:

- ✅ **No authentication required** - Picsum Photos is a public API
- ✅ **No credentials in code** - No API keys, tokens, or secrets
- ✅ **CORS enabled** - Picsum allows cross-origin requests
- ✅ **HTTPS only** - Uses secure protocol

### Potential Issue:

If you later add a **real** API (like Unsplash with API key), follow this pattern:

```javascript
// ❌ WRONG - Exposes key to anyone reading source
const API_KEY = "sk-abc123xyz";
const url = `https://api.unsplash.com/photos?key=${API_KEY}`;

// ✅ RIGHT - Keep key on backend
const response = await fetch("/api/images", {
  headers: { "Content-Type": "application/json" },
});
```

### Recommendation:

Current code is safe. If adding authentication, move API keys to environment variables:

```bash
# .env (never commit this file!)
REACT_APP_UNSPLASH_KEY=your_key_here

# .gitignore
.env
.env.local
```

```javascript
// Safe to use in code:
const API_KEY = process.env.REACT_APP_UNSPLASH_KEY;
```

---

## 2. 🏃 Race Conditions - CRITICAL ISSUE ❌

### What Is a Race Condition?

When user clicks buttons rapidly, multiple requests start. The LAST one finishes and overwrites data from the FIRST one, causing weird bugs.

### Example Scenario:

```
1. User clicks "calm" → Request #1 starts
2. (quickly) User clicks "loud" → Request #2 starts
3. Request #2 finishes first → Shows loud images ✅
4. Request #1 finishes later → Overwrites with calm images ❌
   (But user expects loud!)
```

### Current Code Analysis:

#### Attempt to Prevent (Lines 26-28):

```javascript
if (lastFetchRef.current === mood && loading) {
  return; // Don't fetch if already fetching same mood
}
```

**Problem**: This only prevents fetching the SAME mood twice. It doesn't prevent the race condition when fetching DIFFERENT moods!

#### AbortController (Lines 30-32):

```javascript
if (abortControllerRef.current) {
  abortControllerRef.current.abort(); // Cancel old request
}
```

**Problem**: This aborts the request, BUT the setTimeout still executes!

```javascript
// The issue:
setTimeout(() => {
  setImages(fetchedImages); // Still updates state even though request was aborted!
  setLoading(false);
}, 600);
```

### Proof of Bug:

1. User clicks "calm"
   - `fetchImages("calm")` called
   - `setTimeout(..., 600)` scheduled
   - Loading shows skeletons

2. User quickly clicks "loud" (before 600ms passes)
   - Old `abortControllerRef.current.abort()` called ✅
   - New `fetchImages("loud")` called
   - NEW `setTimeout(..., 600)` scheduled

3. **BUG**: Both setTimeouts might fire!
   - First setTimeout (calm): `setImages(calmImages)`
   - Second setTimeout (loud): `setImages(loudImages)`
   - BUT if timing is right, you see calm images with loud state!

### Fix #1: Request Tracking (Quick Fix)

```javascript
// Add a request ID
const requestIdRef = useRef(0);

const fetchImages = useCallback(
  (mood) => {
    if (lastFetchRef.current === mood && loading) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const requestId = ++requestIdRef.current; // NEW: Track this request

    abortControllerRef.current = new AbortController();
    lastFetchRef.current = mood;

    setLoading(true);
    setError(null);
    setSelectedMood(mood);

    const urls = Array.from(
      { length: 5 },
      (_, i) => `https://picsum.photos/400/300?random=${mood}${i}${Date.now()}`,
    );

    try {
      const fetchedImages = urls.map((url, i) => ({
        src: url,
        alt: `${mood} image ${i + 1}`,
      }));

      setTimeout(() => {
        // NEW: Only update if this is still the latest request!
        if (requestId === requestIdRef.current) {
          setImages(fetchedImages);
          setLoading(false);
        }
      }, 600);
    } catch (err) {
      if (err.name !== "AbortError") {
        if (requestId === requestIdRef.current) {
          // NEW: Check here too
          setError("Failed to load images. Please try again.");
          setLoading(false);
        }
      }
    }
  },
  [loading],
);
```

### Fix #2: useEffect with AbortSignal (Better Fix)

```javascript
// Replace fetchImages with useEffect:
useEffect(() => {
  if (!selectedMood) return;

  const controller = new AbortController();
  let isMounted = true;

  const fetch_Images = async () => {
    try {
      setLoading(true);
      setError(null);

      const urls = Array.from(
        { length: 5 },
        (_, i) =>
          `https://picsum.photos/400/300?random=${selectedMood}${i}${Date.now()}`,
      );

      const fetchedImages = urls.map((url, i) => ({
        src: url,
        alt: `${selectedMood} image ${i + 1}`,
      }));

      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 600));

      if (isMounted && !controller.signal.aborted) {
        setImages(fetchedImages);
      }
    } catch (err) {
      if (isMounted && err.name !== "AbortError") {
        setError("Failed to load images. Please try again.");
      }
    } finally {
      if (isMounted && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  fetch_Images();

  // Cleanup function
  return () => {
    isMounted = false;
    controller.abort();
  };
}, [selectedMood]);

// Remove fetchImages callback, use this instead:
const handleMoodClick = (mood) => {
  setSelectedMood(mood); // This triggers the useEffect
};
```

---

## 3. 🚫 API Rate Limiting - UNPROTECTED ⚠️

### What Is Rate Limiting?

APIs limit how many requests you can make. If you exceed the limit, requests fail.

**Picsum Photos** has NO documented rate limit, but it could reject excessive requests.

### Current Issues:

1. **No retry backoff** - Fails immediately on second attempt
2. **No request throttling** - Rapid clicks = many simultaneous requests
3. **No queue system** - Every click starts a new request
4. **No caching** - Same mood fetches new images every time

### Risk Scenario:

```javascript
// User clicks "calm" 20 times in 2 seconds
// = 20 requests to Picsum simultaneously
// = Picsum returns 429 (Too Many Requests)
// = App shows error forever (no retry)
```

### Fix #1: Throttle Requests

```javascript
// Add throttle hook
function useThrottledCallback(callback, delay) {
  const lastCallRef = useRef(Date.now());

  return useCallback(
    (...args) => {
      const now = Date.now();
      if (now - lastCallRef.current >= delay) {
        lastCallRef.current = now;
        callback(...args);
      }
    },
    [callback, delay]
  );
}

// Use it:
const handleMoodClickThrottled = useThrottledCallback(
  handleMoodClick,
  1000  // Max 1 request per second
);

// In JSX:
<button onClick={() => handleMoodClickThrottled(mood)}>
```

### Fix #2: Add Exponential Backoff for Retries

```javascript
const fetchImages = useCallback(
  async (mood, retryCount = 0) => {
    if (lastFetchRef.current === mood && loading) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    lastFetchRef.current = mood;

    setLoading(true);
    setError(null);
    setSelectedMood(mood);

    try {
      const urls = Array.from(
        { length: 5 },
        (_, i) =>
          `https://picsum.photos/400/300?random=${mood}${i}${Date.now()}`,
      );

      const fetchedImages = urls.map((url, i) => ({
        src: url,
        alt: `${mood} image ${i + 1}`,
      }));

      await new Promise((resolve) => setTimeout(resolve, 600));

      setImages(fetchedImages);
      setLoading(false);
    } catch (err) {
      if (err.name === "AbortError") return;

      // NEW: Exponential backoff retry
      if (retryCount < 3) {
        const delayMs = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        console.log(`Retry ${retryCount + 1} after ${delayMs}ms`);

        setTimeout(() => {
          fetchImages(mood, retryCount + 1);
        }, delayMs);
      } else {
        setError("Failed to load images. Please try again later.");
        setLoading(false);
      }
    }
  },
  [loading],
);
```

### Fix #3: Cache Results

```javascript
const imagesCacheRef = useRef({}); // { "calm": [...], "loud": [...] }

const fetchImages = useCallback(
  (mood) => {
    // NEW: Check cache first
    if (imagesCacheRef.current[mood]) {
      setImages(imagesCacheRef.current[mood]);
      setSelectedMood(mood);
      setLoading(false);
      return;
    }

    // ... rest of fetch logic ...

    setTimeout(() => {
      // NEW: Cache the result
      imagesCacheRef.current[mood] = fetchedImages;
      setImages(fetchedImages);
      setLoading(false);
    }, 600);
  },
  [loading],
);
```

---

## 4. ♿ Accessibility - GOOD (But Can Be Better) ✅/⚠️

### What We're Checking:

1. **Alt text** for images
2. **Semantic HTML**
3. **Keyboard navigation**
4. **Screen reader support**

### Current Implementation:

#### Alt Text - GOOD ✅

```javascript
// In App.js:
const fetchedImages = urls.map((url, i) => ({
  src: url,
  alt: `${mood} image ${i + 1}`, // ✅ Has alt text!
}));

// In ImageCard.js:
<img
  src={image.src}
  alt={image.alt} // ✅ Uses alt prop
  className="image-card-img"
  loading="lazy"
/>;
```

✅ **Good**: Every image has an alt attribute!

**Could be better:**

```javascript
// Current: "calm image 1"
// Better: "Peaceful landscape with calm waters"
// Best: Use AI to generate or fetch real descriptions
```

#### Semantic HTML - GOOD ✅

```javascript
// Good practices:
<header className="app-header">      // ✅ Semantic
  <h1>🌈 The Vibe Atlas</h1>          // ✅ Proper heading
  <p>Explore images...</p>            // ✅ Paragraph
</header>

<button className="mood-button">     // ✅ Real button element
  <span className="mood-emoji">🧘</span>
  <span className="mood-label">calm</span>
</button>
```

✅ **Good**: Uses proper semantic HTML elements!

#### Keyboard Navigation - PARTIAL ⚠️

```javascript
// Current:
<button
  onClick={() => onMoodClick(mood)}
  title={`Show ${mood} images`}
>
```

✅ **Good**: Uses `<button>` which is keyboard accessible by default

⚠️ **Missing**: No visible focus indicator (depends on CSS)

Add to CSS:

```css
.mood-button:focus-visible {
  outline: 3px solid #4caf50;
  outline-offset: 2px;
}
```

#### Screen Reader Support - PARTIAL ⚠️

```javascript
// Good:
<img alt={image.alt} />

// Missing: ARIA labels where needed:
<div className="image-grid-container">
  {/* Should have role and label */}
  <div className="image-grid" role="region" aria-label="Image gallery">
    {images.map(image => (
      <ImageCard key={i} image={image} />
    ))}
  </div>
</div>

// Error state should announce
{error && (
  <div
    className="error-state"
    role="alert"  // NEW: Tells screen readers this is important
    aria-live="polite"  // NEW: Announces to screen readers
  >
    <h2>⚠️ Oops!</h2>
    <p>{error}</p>
  </div>
)}
```

### Fixes for Accessibility:

#### Fix 1: Improve Alt Text

```javascript
// In App.js:
const MOOD_DESCRIPTIONS = {
  calm: "serene and peaceful",
  loud: "vibrant and energetic",
  warm: "cozy and golden",
  lonely: "solitary and quiet",
  bright: "sunny and colorful",
};

const fetchedImages = urls.map((url, i) => ({
  src: url,
  // Better alt text:
  alt: `${MOOD_DESCRIPTIONS[mood]} scene ${i + 1}`,
}));
```

#### Fix 2: Add ARIA Labels

```javascript
// In ImageGrid.js:
<div className="image-grid-container">
  {error ? (
    <div className="error-state" role="alert" aria-live="polite">
      <h2>⚠️ Oops!</h2>
      <p>{error}</p>
      <button className="retry-button" onClick={onRetry}>
        Try Again
      </button>
    </div>
  ) : loading ? (
    <div className="image-grid" aria-label="Loading images" aria-busy="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonLoader key={i} />
      ))}
    </div>
  ) : images.length > 0 ? (
    <div
      className="image-grid"
      role="region"
      aria-label={`Image gallery showing ${images.length} ${selectedMood} images`}
    >
      {images.map((image, i) => (
        <ImageCard key={i} image={image} />
      ))}
    </div>
  ) : (
    <div className="empty-state">
      <p>Select a mood to get started 👆</p>
    </div>
  )}
</div>
```

#### Fix 3: Focus Styles (CSS)

```css
/* Add to MoodButtons.css or App.css */
.mood-button:focus-visible {
  outline: 3px solid #4caf50;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(76, 175, 80, 0.2);
}

.retry-button:focus-visible {
  outline: 3px solid #ff6b6b;
  outline-offset: 2px;
}

/* Ensure images are accessible */
.image-card-img {
  /* This helps screen readers know about image changes */
  image-rendering: auto;
}
```

#### Fix 4: Skip Links (Optional)

```javascript
// Add to App.js JSX:
<>
  <a href="#image-grid" className="skip-link">
    Skip to image gallery
  </a>

  <header className="app-header">{/* ... */}</header>

  <MoodButtons {...props} />

  <main id="image-grid">
    <ImageGrid {...props} />
  </main>
</>
```

```css
/* In App.css */
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: #000;
  color: white;
  padding: 8px;
  text-decoration: none;
  z-index: 100;
}

.skip-link:focus {
  top: 0;
}
```

---

## 5. ⚡ Performance - MODERATE ISSUES ⚠️

### Issue 1: Unnecessary Re-renders from useCallback

```javascript
const fetchImages = useCallback(
  (mood) => { ... },
  [loading],  // ❌ PROBLEM: Re-creates function whenever loading changes
);
```

**Problem**:

- When `loading` changes, `fetchImages` is recreated
- Which might trigger dependent effects
- Which might cause component re-renders

**Fix**:

```javascript
const fetchImages = useCallback(
  (mood) => { ... },
  []  // ✅ Empty dependencies - function never recreates
);
```

### Issue 2: Array Index as Key

```javascript
{
  images.map((image, i) => (
    <ImageCard key={i} image={image} /> // ⚠️ Using index as key
  ));
}
```

**Problem**:

- If images list changes order, React re-renders everything
- Can cause visual bugs with animations
- React docs: "We don't recommend using indexes for keys"

**Fix**:

```javascript
{
  images.map((image, i) => (
    <ImageCard key={`${selectedMood}-${i}`} image={image} /> // Better but not ideal
  ));
}

// Even better - add IDs to images:
{
  images.map((image) => (
    <ImageCard key={image.id} image={image} /> // ✅ Unique, stable ID
  ));
}
```

### Issue 3: Re-generating URLs on Every Render

```javascript
const urls = Array.from(
  { length: 5 },
  (_, i) => `https://picsum.photos/400/300?random=${mood}${i}${Date.now()}`,
);
```

**Problem**: `Date.now()` creates different URLs every render

- If you accidentally call `fetchImages` multiple times, you fetch different images
- Wastes bandwidth

**Fix** - Save the timestamp:

```javascript
const timestampRef = useRef(Date.now());

const urls = Array.from(
  { length: 5 },
  (_, i) =>
    `https://picsum.photos/400/300?random=${mood}${i}${timestampRef.current}`,
);
```

### Issue 4: Lazy Loading Good, But No Blur-Up

```javascript
<img
  src={image.src}
  alt={image.alt}
  className="image-card-img"
  loading="lazy" // ✅ Good!
/>
```

✅ **Good**: Uses native lazy loading

**Could improve** with progressive loading:

```javascript
<img
  src={image.src}
  alt={image.alt}
  className="image-card-img"
  loading="lazy"
  srcSet={`
    ${image.src}?w=100 100w,
    ${image.src}?w=400 400w
  `} // Load different sizes
  sizes="(max-width: 600px) 100vw, 400px"
/>
```

### Issue 5: No Memoization of Components

```javascript
function ImageCard({ image }) {
  return (
    <div className="image-card">
      <img src={image.src} alt={image.alt} loading="lazy" />
      <div className="image-overlay"></div>
    </div>
  );
}

// Better:
export default React.memo(ImageCard);
```

### Performance Fixes

#### Fix 1: Memoize Components

```javascript
// ImageCard.js
import React from "react";
import "./ImageCard.css";

function ImageCard({ image }) {
  return (
    <div className="image-card">
      <img
        src={image.src}
        alt={image.alt}
        className="image-card-img"
        loading="lazy"
      />
      <div className="image-overlay"></div>
    </div>
  );
}

// NEW: Only re-render if image prop changes
export default React.memo(ImageCard, (prevProps, nextProps) => {
  return prevProps.image.src === nextProps.image.src;
});
```

#### Fix 2: Use useMemo for URL Generation

```javascript
// In App.js:
const urls = useMemo(() => {
  if (!selectedMood) return [];

  return Array.from(
    { length: 5 },
    (_, i) =>
      `https://picsum.photos/400/300?random=${selectedMood}${i}${Date.now()}`,
  );
}, [selectedMood]);
```

#### Fix 3: Optimize CSS for Performance

```css
/* Good - uses transform (GPU accelerated) */
.image-overlay {
  transform: translate3d(0, 0, 0); /* Enable GPU acceleration */
  will-change: opacity; /* Tell browser this might animate */
}

/* Avoid - uses left/top (CPU heavy) */
.image-overlay {
  left: 0; /* ❌ Causes reflow */
  top: 0;
}
```

---

## Summary Audit Table

| Issue                  | Severity    | Status         | Fix Needed                         |
| ---------------------- | ----------- | -------------- | ---------------------------------- |
| API Key Exposure       | 🔴 Critical | ✅ Secure      | None                               |
| Race Conditions        | 🔴 Critical | ❌ Broken      | Use request tracking or useEffect  |
| Rate Limiting          | 🟡 High     | ⚠️ Unhandled   | Add throttle + exponential backoff |
| Alt Text               | 🟢 Low      | ✅ Good        | Improve descriptions slightly      |
| ARIA Labels            | 🟡 High     | ⚠️ Partial     | Add role, aria-live, aria-label    |
| Focus Styles           | 🟡 High     | ⚠️ Missing     | Add CSS focus-visible              |
| useCallback Dependency | 🔴 Critical | ❌ Wrong       | Change [loading] to []             |
| Index as Key           | 🟡 Medium   | ⚠️ Not ideal   | Use stable IDs                     |
| Component Memoization  | 🟡 Medium   | ⚠️ Missing     | Add React.memo                     |
| URL Regeneration       | 🟡 Medium   | ⚠️ Inefficient | Use useMemo or useRef              |

---

## Quick Fixes Priority

### Must Do (Blocks Deployment):

1. ✅ Fix race condition with request tracking
2. ✅ Fix useCallback dependency bug
3. ✅ Add rate limiting throttle

### Should Do (Best Practices):

4. ✅ Add ARIA labels
5. ✅ Memoize ImageCard component
6. ✅ Add focus-visible styles

### Nice to Have (Polish):

7. ✅ Improve alt text descriptions
8. ✅ Add skip links
9. ✅ Optimize CSS performance
