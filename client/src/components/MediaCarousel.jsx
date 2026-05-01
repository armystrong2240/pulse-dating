import { useState } from "react";
import { toAssetUrl } from "../api/client";

export const MediaCarousel = ({ items }) => {
  const [idx, setIdx] = useState(0);

  if (!items || items.length === 0) return null;

  const current = items[idx];
  const prev = () => setIdx((i) => (i - 1 + items.length) % items.length);
  const next = () => setIdx((i) => (i + 1) % items.length);

  return (
    <div className="carousel">
      <div className="carousel-media">
        {current.type === "video" ? (
          <video key={current.id} controls src={toAssetUrl(current.url)} />
        ) : (
          <img key={current.id} src={toAssetUrl(current.url)} alt={`Media ${idx + 1}`} />
        )}
      </div>

      {items.length > 1 && (
        <>
          <button className="carousel-btn carousel-prev" onClick={prev} aria-label="Previous">‹</button>
          <button className="carousel-btn carousel-next" onClick={next} aria-label="Next">›</button>
          <div className="carousel-dots">
            {items.map((_, i) => (
              <button key={i} className={`carousel-dot${i === idx ? " active" : ""}`}
                onClick={() => setIdx(i)} aria-label={`Go to ${i + 1}`} />
            ))}
          </div>
        </>
      )}

      <p className="carousel-counter muted">{idx + 1} / {items.length}</p>
    </div>
  );
};
