import { Link } from "react-router-dom";
import { toAssetUrl } from "../api/client";

export const ProfileCard = ({ profile }) => {
  return (
    <article className="profile-card">
      <img src={toAssetUrl(profile.avatar)} alt={`${profile.name} avatar`} />
      <div className="profile-card-body">
        <h3>{profile.name}, {profile.age}</h3>
        <p className="muted">{profile.city}{profile.sexualOrientation ? ` · ${profile.sexualOrientation}` : ""}</p>
        <p>{profile.bio}</p>
        <div className="chip-row">
          {profile.interests.map((interest) => (
            <span className="chip" key={`${profile.id}-${interest}`}>
              {interest}
            </span>
          ))}
        </div>
      </div>
      <Link to={`/profiles/${profile.id}`} className="btn-secondary">
        View Profile
      </Link>
    </article>
  );
};
