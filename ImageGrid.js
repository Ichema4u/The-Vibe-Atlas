import React from "react";
import "./ImageGrid.css";
import ImageCard from "./ImageCard";
import SkeletonLoader from "./SkeletonLoader";

function ImageGrid({ images, loading, error, onRetry }) {
  return (
    <div className="image-grid-container">
      {error ? (
        <div className="error-state">
          <div className="error-content">
            <h2>⚠️ Oops!</h2>
            <p>{error}</p>
            <button className="retry-button" onClick={onRetry}>
              Try Again
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="image-grid">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonLoader key={i} />
          ))}
        </div>
      ) : images.length > 0 ? (
        <div className="image-grid">
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
  );
}

export default ImageGrid;
