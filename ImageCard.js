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

export default ImageCard;
