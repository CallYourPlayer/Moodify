import { useState, useEffect } from "react";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

function App() {
  const [prompt, setPrompt] = useState("");
  const [playlistName, setPlaylistName] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const BACKEND_URL =
    process.env.REACT_APP_BACKEND_URL || "http://localhost:3000";

  /* =========================
     SUPABASE SESSION
  ========================= */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  /* =========================
     LOGIN EMAIL/PASSWORD
  ========================= */
  const login = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) alert(error.message);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setResult(null);
  };

  /* =========================
     SALVA TOKEN YOUTUBE
  ========================= */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ytToken = params.get("access_token");

    if (ytToken) {
      localStorage.setItem("yt_token", ytToken);
      window.history.replaceState({}, document.title, "/");
    }
  }, []);

  /* =========================
     GENERA PLAYLIST
  ========================= */
  const generatePlaylist = async () => {
    if (!session) {
      alert("Devi fare login prima.");
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(
        `${BACKEND_URL}/generate-playlist`,
        {
          prompt,
          playlistName,
          access_token: localStorage.getItem("yt_token"),
        },
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      setResult(response.data);
    } catch (error) {
      console.error(error);
      alert("Errore generazione playlist.");
    }

    setLoading(false);
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "Arial" }}>
      <h1>🎵 AI Playlist Generator</h1>

      {/* ===== LOGIN SUPABASE ===== */}
      {!session ? (
        <div>
          <h3>Login</h3>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <br />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <br />
          <button onClick={login}>Login</button>
        </div>
      ) : (
        <div>
          <p>Loggato come: {session.user.email}</p>
          <button onClick={logout}>Logout</button>
        </div>
      )}

      <hr />

      <p>
        1️⃣ Fai login su YouTube:{" "}
        <a href={`${BACKEND_URL}/login`}>Login YouTube</a>
      </p>

      <p>2️⃣ Genera playlist</p>

      <input
        type="text"
        placeholder="Descrivi la situazione..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        style={{ width: "100%", marginBottom: "10px" }}
      />

      <input
        type="text"
        placeholder="Nome playlist"
        value={playlistName}
        onChange={(e) => setPlaylistName(e.target.value)}
        style={{ width: "100%", marginBottom: "10px" }}
      />

      <button onClick={generatePlaylist} disabled={loading}>
        {loading ? "Generando..." : "Genera Playlist"}
      </button>

      {result && (
        <div style={{ marginTop: "20px" }}>
          <h2>Playlist creata! 🎉</h2>
          <a href={result.playlistUrl} target="_blank" rel="noreferrer">
            Apri su YouTube
          </a>

          <ul>
            {result.tracks.map((track, index) => (
              <li key={index}>
                {track.name} – {track.artist}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;