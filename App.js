import React, { useState, useRef, useCallback, useEffect } from "react";
import "./App.css";
import ImageGrid from "./components/ImageGrid";
import MoodButtons from "./components/MoodButtons";

function App() {
  const [selectedMood, setSelectedMood] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);
  const timeoutRef = useRef(null);
  const lastFetchRef = useRef(null);

  const MOODS = ["calm", "loud", "warm", "lonely", "bright"];

  const MOOD_KEYWORDS = {
    calm: "peaceful, serene, quiet",
    loud: "vibrant, energetic, bold",
    warm: "cozy, sunset, golden",
    lonely: "solitude, misty, empty",
    bright: "sunny, colorful, vivid",
  };

  const fetchImages = useCallback(
    (mood) => {
      // Prevent duplicate fetches if one is already in progress
      if (lastFetchRef.current === mood && loading) {
        return;
      }

      // Cancel previous request if exists
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();
      const currentController = abortControllerRef.current;
      lastFetchRef.current = mood;

      setLoading(true);
      setError(null);
      setSelectedMood(mood);

      // Using Picsum Photos API - no CORS issues, works with localhost
      // Generates 5 different images with random seeding
      const urls = Array.from(
        { length: 5 },
        (_, i) =>
          `https://picsum.photos/400/300?random=${mood}${i}${Date.now()}`,
      );

      try {
        const fetchedImages = urls.map((url, i) => ({
          src: url,
          alt: `${mood} image ${i + 1}`,
        }));

        // Simulate network delay to show skeleton loaders
        timeoutRef.current = setTimeout(() => {
          if (currentController.signal.aborted) {
            return;
          }

          setImages(fetchedImages);
          setLoading(false);
          timeoutRef.current = null;
        }, 600);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError("Failed to load images. Please try again.");
          setLoading(false);
        }
      }
    },
    [loading],
  );

  const handleMoodClick = (mood) => {
    fetchImages(mood);
  };

  const handleRetry = () => {
    if (selectedMood) {
      fetchImages(selectedMood);
    }
  };

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="App">
      <header className="app-header">
        <h1>🌈 The Vibe Atlas</h1>
        <p>Explore images that match your vibe</p>
      </header>

      <MoodButtons
        moods={MOODS}
        selectedMood={selectedMood}
        onMoodClick={handleMoodClick}
      />

      <ImageGrid
        images={images}
        loading={loading}
        error={error}
        onRetry={handleRetry}
      />
    </div>
  );
}

export default App;
