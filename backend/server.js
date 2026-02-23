import express from "express";
import dotenv from "dotenv";
import SpotifyWebApi from "spotify-web-api-node";
import OpenAI from "openai";
import cors from "cors";
import cookieParser from "cookie-parser";

dotenv.config();

const app = express();

// 🔹 CORS: inserisci l'URL del frontend Render
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json());

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const scopes = [
  "playlist-modify-public",
  "playlist-modify-private",
  "user-read-private",
];

const validGenres = [
  "pop", "rock", "hip-hop", "dance", "country",
  "jazz", "classical", "blues", "metal", "reggae",
  "soul", "punk", "funk", "electronic"
];

// 🔹 1️⃣ Login Spotify
app.get("/login", (req, res) => {
  const authorizeURL = spotifyApi.createAuthorizeURL(scopes, "state123");
  res.redirect(authorizeURL);
});

// 🔹 2️⃣ Callback OAuth
app.get("/callback", async (req, res) => {
  const code = req.query.code;

  try {
    const data = await spotifyApi.authorizationCodeGrant(code);
    let access_token = data.body.access_token;
    const refresh_token = data.body.refresh_token;

    // Redirect verso frontend pubblico
    return res.redirect(
      `${FRONTEND_URL}/?access_token=${access_token}&refresh_token=${refresh_token}`
    );

  } catch (err) {
    console.error(err);
    return res.status(500).send("Errore login Spotify ❌");
  }
});

// 🔹 3️⃣ Genera playlist
app.post("/generate-playlist", async (req, res) => {
  try {
    const { prompt, playlistName, access_token, refresh_token } = req.body;

    if (!prompt || !playlistName)
      return res.status(400).json({ error: "Devi inviare prompt e playlistName" });

    if (!access_token || !refresh_token)
      return res.status(401).json({ error: "Devi prima loggarti a Spotify (/login)" });

    spotifyApi.setAccessToken(access_token);
    spotifyApi.setRefreshToken(refresh_token);

    // Aggiorna access token se scaduto
    try {
      await spotifyApi.getMe();
    } catch (err) {
      if (err.statusCode === 401) {
        const data = await spotifyApi.refreshAccessToken();
        access_token = data.body.access_token;
        spotifyApi.setAccessToken(access_token);
        res.cookie("access_token", access_token, { httpOnly: true, sameSite: "lax" });
      } else throw err;
    }

    // Analizza prompt con AI
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Estrai mood (string), energy (0-1) e generi (array) dal testo, restituisci solo JSON valido"
        },
        { role: "user", content: prompt },
      ],
    });

    const aiData = JSON.parse(aiResponse.choices[0].message.content);

    // Filtra generi validi
    const genres = (aiData.genres || ["pop"])
      .filter(g => validGenres.includes(g.toLowerCase()))
      .slice(0, 3);

    const targetEnergy = Math.min(Math.max(aiData.energy || 0.5, 0), 1);

    // Ottieni raccomandazioni Spotify
    const recs = await spotifyApi.getRecommendations({
      seed_genres: genres.length ? genres : ["pop"],
      target_energy: targetEnergy,
      limit: 20,
    });

    const trackUris = recs.body.tracks.map(t => t.uri);

    // Ottieni user ID
    const me = await spotifyApi.getMe();

    // Crea playlist
    const playlist = await spotifyApi.createPlaylist(me.body.id, playlistName, {
      public: false,
    });

    // Aggiungi tracce
    await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);

    res.json({
      message: "Playlist creata con successo! ✅",
      playlistUrl: playlist.body.external_urls.spotify,
      mood: aiData.mood,
      energy: aiData.energy,
      genres,
      tracks: recs.body.tracks.map(t => ({
        name: t.name,
        artist: t.artists[0].name,
        url: t.external_urls.spotify,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore nella generazione della playlist" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server attivo su http://0.0.0.0:${PORT}`);
});