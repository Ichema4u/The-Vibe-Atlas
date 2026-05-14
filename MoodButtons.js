import React from "react";
import "./MoodButtons.css";

function MoodButtons({ moods, selectedMood, onMoodClick }) {
  const moodEmojis = {
    calm: "🧘",
    loud: "🎵",
    warm: "🔥",
    lonely: "🌙",
    bright: "✨",
  };

  return (
    <div className="mood-buttons-container">
      <div className="mood-buttons">
        {moods.map((mood) => (
          <button
            key={mood}
            className={`mood-button ${selectedMood === mood ? "active" : ""}`}
            onClick={() => onMoodClick(mood)}
            title={`Show ${mood} images`}
          >
            <span className="mood-emoji">{moodEmojis[mood]}</span>
            <span className="mood-label">{mood}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default MoodButtons;
