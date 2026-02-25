import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import OpenAI from "openai";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
  
  async function extractTags(prompt) {
  // 🔵 1️⃣ Prova OpenAI
  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Estrai massimo 3 tag musicali dalla descrizione. Rispondi SOLO in JSON: { \"tags\": [\"tag1\", \"tag2\"] }",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      });

      const text = completion.choices[0].message.content;
      const parsed = JSON.parse(text);
      if (parsed.tags?.length) return parsed.tags;

    } catch (err) {
      console.warn("⚠️ OpenAI fallito:", err.message);
    }
  }

  // 🟡 2️⃣ Fallback Hugging Face
  try {
    const response = await axios.post(
      "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
      {
        inputs: `
        Estrai massimo 3 tag musicali dalla descrizione seguente.
        Rispondi solo con una lista separata da virgole.
        
        Descrizione: ${prompt}
        `,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.HF_API_KEY}`,
        },
      }
    );

    const generated =
      response.data[0]?.generated_text || "";

    const tags = generated
      .split(",")
      .map(t => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 3);

    if (tags.length) return tags;

  } catch (err) {
    console.warn("⚠️ Hugging Face fallito:", err.message);
  }

  // 🔴 3️⃣ Fallback definitivo (mai errore 500)
  console.warn("⚠️ Uso fallback statico");
  return ["pop", "chill", "indie"];
}

/* =========================
   LOGIN YOUTUBE
========================= */
app.get("/login", (req, res) => {
  const redirect = "https://accounts.google.com/o/oauth2/v2/auth" +
    `?client_id=${process.env.YT_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(process.env.YT_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent("https://www.googleapis.com/auth/youtube")}` +
    `&access_type=offline` +
    `&prompt=consent`;

  res.redirect(redirect);
});

/* =========================
   CALLBACK YOUTUBE
========================= */
app.get("/callback", async (req, res) => {
  try {
    const code = req.query.code;

    const tokenRes = await axios.post(
      "https://oauth2.googleapis.com/token",
      null,
      {
        params: {
          code,
          client_id: process.env.YT_CLIENT_ID,
          client_secret: process.env.YT_CLIENT_SECRET,
          redirect_uri: process.env.YT_REDIRECT_URI,
          grant_type: "authorization_code",
        },
      }
    );

    const access_token = tokenRes.data.access_token;

    res.redirect(
      `${process.env.FRONTEND_URL}/?access_token=${access_token}`
    );
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).send("Errore login YouTube");
  }
});

/* =========================
   GENERA PLAYLIST
========================= */
app.post("/generate-playlist", async (req, res) => {
  try {
    const { prompt, playlistName, access_token } = req.body;

    if (!prompt || !playlistName || !access_token) {
      return res.status(400).json({ error: "Dati mancanti" });
    }

    /* 1️⃣ AI → Estrai tag con fallback */
    const tags = await extractTags(prompt);

    /* 2️⃣ Last.fm → Top tracks per tag */
    let tracks = [];

    for (const tag of tags) {
      try {
        const lastfmRes = await axios.get(
          "http://ws.audioscrobbler.com/2.0/",
          {
            params: {
              method: "tag.gettoptracks",
              tag,
              api_key: process.env.LASTFM_API_KEY,
              format: "json",
              limit: 5,
            },
          }
        );

        tracks.push(...(lastfmRes.data.tracks?.track || []));
      } catch (err) {
        console.warn("Errore Last.fm per tag:", tag);
      }
    }

    tracks = tracks.slice(0, 15);

    if (!tracks.length) {
      return res.status(400).json({ error: "Nessun brano trovato" });
    }

    /* 3️⃣ Crea playlist YouTube */
    const playlistRes = await axios.post(
      "https://www.googleapis.com/youtube/v3/playlists",
      {
        snippet: { title: playlistName },
        status: { privacyStatus: "private" },
      },
      {
        headers: { Authorization: `Bearer ${access_token}` },
        params: { part: "snippet,status" },
      }
    );

    const playlistId = playlistRes.data.id;

    /* 4️⃣ Cerca ogni brano su YouTube e aggiungilo */
    for (const track of tracks) {
      try {
        const searchRes = await axios.get(
          "https://www.googleapis.com/youtube/v3/search",
          {
            params: {
              part: "snippet",
              q: `${track.artist.name} ${track.name}`,
              type: "video",
              maxResults: 1,
              key: process.env.YT_API_KEY,
            },
          }
        );

        const video = searchRes.data.items[0];
        if (!video) continue;

        await axios.post(
          "https://www.googleapis.com/youtube/v3/playlistItems",
          {
            snippet: {
              playlistId,
              resourceId: {
                kind: "youtube#video",
                videoId: video.id.videoId,
              },
            },
          },
          {
            headers: { Authorization: `Bearer ${access_token}` },
            params: { part: "snippet" },
          }
        );

      } catch (err) {
        console.warn("Errore aggiunta brano:", track.name);
      }
    }

    /* 5️⃣ Risposta finale */
    res.json({
      playlistUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
      tags,
      tracks: tracks.map(t => ({
        name: t.name,
        artist: t.artist.name,
      })),
    });

  } catch (err) {
    console.error("Errore generate-playlist:", err.response?.data || err.message);
    res.status(500).json({ error: "Errore generazione playlist" });
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log("Server attivo")
);
