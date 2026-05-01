import { useState } from "react";
import { api } from "../api/client";

const initialForm = {
  name: "",
  age: "",
  city: "",
  sexualOrientation: "",
  polyPreference: "",
  bio: "",
  interests: "",
  lookingFor: "Long-term relationship",
  avatar: "",
};

export const CreateProfilePage = () => {
  const [form, setForm] = useState(initialForm);
  const [createdProfile, setCreatedProfile] = useState(null);
  const [error, setError] = useState("");

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    try {
      setError("");
      const { data } = await api.post("/profiles", {
        ...form,
        interests: form.interests.split(",").map((item) => item.trim()),
      });
      setCreatedProfile(data);
      setForm(initialForm);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to create profile.");
    }
  };

  return (
    <section className="page">
      <h2>Create Your Profile</h2>
      <p className="muted">Set your public profile and start connecting.</p>

      <form className="stack-form" onSubmit={onSubmit}>
        <input name="name" value={form.name} onChange={onChange} placeholder="Name" required />
        <input name="age" value={form.age} onChange={onChange} placeholder="Age" required type="number" />
        <input name="city" value={form.city} onChange={onChange} placeholder="City" required />
        <input
          name="sexualOrientation"
          value={form.sexualOrientation}
          onChange={onChange}
          placeholder="Sexual orientation (optional)"
        />
        <input name="avatar" value={form.avatar} onChange={onChange} placeholder="Avatar URL (optional)" />
        <input
          name="interests"
          value={form.interests}
          onChange={onChange}
          placeholder="Interests (comma separated)"
        />
        <input name="lookingFor" value={form.lookingFor} onChange={onChange} placeholder="Looking for" />
        <select name="polyPreference" value={form.polyPreference} onChange={onChange}>
          <option value="">Relationship style (optional)</option>
          <option>Prefer monogamy</option>
          <option>Open to monogamy</option>
          <option>Open to polyamory</option>
          <option>Polyamorous</option>
          <option>Not sure yet</option>
          <option>Prefer not to say</option>
        </select>
        <textarea name="bio" value={form.bio} onChange={onChange} placeholder="Short bio" required rows={5} />
        <button className="btn-primary" type="submit">Create Profile</button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      {createdProfile ? (
        <p className="success">Profile created for {createdProfile.name}. Go to Discover to find people.</p>
      ) : null}
    </section>
  );
};
