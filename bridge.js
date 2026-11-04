// Programme de liaison : se connecte à un live TikTok (lecture publique seulement)
// et transmet les cadeaux et les likes à la page de l'arène via WebSocket.
//
// Usage : node bridge.js <pseudo_tiktok_sans_@>
// Puis ouvrir http://localhost:8080 (ou l'ajouter comme source navigateur dans LIVE Studio).

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');

// Pseudo : argument de ligne de commande, ou variable d'environnement TIKTOK_USER (pour un hébergeur).
const username = (process.argv[2] || process.env.TIKTOK_USER || '').replace(/^@/, '');
if (!username) {
  console.error('Usage : node bridge.js <pseudo_tiktok_sans_@>  (ou variable TIKTOK_USER)');
  process.exit(1);
}

// Port : fourni par l'hébergeur (PORT), sinon 8080 en local.
const PORT = process.env.PORT || 8080;
const page = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));

// Serveur HTTP : renvoie la page pour toute requête normale.
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page);
});

// WebSocket sur /ws : la page s'y connecte pour recevoir les événements.
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

server.listen(PORT, () => {
  console.log(`Arène démarrée sur le port ${PORT}`);
});

// Connexion au live.
const conn = new WebcastPushConnection(username);

conn.connect()
  .then((state) => {
    console.log(`Connecté au live de @${username}`);
    broadcast({ type: 'status', text: `Connecté au live de @${username}` });
    // Les infos publiques de la salle sont dans state (ex. titre, identifiant de salle).
  })
  .catch((err) => {
    console.error('Connexion impossible :', err.message || err);
    broadcast({ type: 'status', text: `Pas de live en cours pour @${username}` });
  });

conn.on('gift', (data) => {
  // Les cadeaux en série arrivent plusieurs fois : on ne compte qu'à la fin de la série.
  if (data.giftType === 1 && !data.repeatEnd) return;
  const count = data.repeatCount || 1;
  const diamonds = (data.diamondCount || 1) * count;
  console.log(`${data.uniqueId} · ${data.giftName} x${count} (${diamonds} diamants)`);
  broadcast({
    type: 'gift',
    user: data.uniqueId,
    giftName: data.giftName,
    diamonds,
  });
});

conn.on('like', (data) => {
  broadcast({ type: 'like', user: data.uniqueId, count: data.likeCount || 1 });
});

conn.on('disconnected', () => {
  console.log('Déconnecté du live');
  broadcast({ type: 'status', text: 'Déconnecté du live' });
});

conn.on('streamEnd', () => {
  console.log('Le live est terminé');
  broadcast({ type: 'status', text: 'Le live est terminé' });
});
