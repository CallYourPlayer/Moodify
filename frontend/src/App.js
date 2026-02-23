import { useState, useEffect } from "react";
import axios from "axios";

function App() {
  const [prompt, setPrompt] = useState("");
  const [playlistName, setPlaylistName] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // 🔹 Backend URL dinamico
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:3000";

  // 🔹 Salva token dopo redirect login
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (accessToken && refreshToken) {
      localStorage.setItem("access_token", accessToken);
      localStorage.setItem("refresh_token", refreshToken);
      window.history.replaceState({}, document.title, "/");
    }
  }, []);

  const generatePlaylist = async () => {
    setLoading(true);

    try {
      const response = await axios.post(
        `${BACKEND_URL}/generate-playlist`,
        {
          prompt,
          playlistName,
          access_token: localStorage.getItem("access_token"),
          refresh_token: localStorage.getItem("refresh_token"),
        },
        { withCredentials: true }
      );

      setResult(response.data);
    } catch (error) {
      console.error(error);
      alert("Errore generazione playlist. Fai prima login su Spotify.");
    }

    setLoading(false);
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "Arial" }}>
      <h1>🎵 AI Playlist Generator</h1>

      <p>
        Prima fai login su Spotify:{" "}
        <a href={`${BACKEND_URL}/login`}>
          Login Spotify
        </a>
      </p>

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
            Apri su Spotify
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