// Programme de liaison : se connecte à un live TikTok (lecture publique seulement)
// et transmet les cadeaux et les likes à la page de l'arène via WebSocket.
//
// Le pseudo peut être saisi sur la page (bouton « Connecter »), ou donné au démarrage
// (argument node bridge.js <pseudo>, ou variable TIKTOK_USER).

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');

// Port : fourni par l'hébergeur (PORT), sinon 8080 en local.
const PORT = process.env.PORT || 8080;
const page = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));

// Serveur HTTP : renvoie la page pour toute requête normale.
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page);
});

// WebSocket sur /ws : la page s'y connecte pour recevoir les événements et envoyer un pseudo.
const wss = new WebSocketServer({ server, path: '/ws' });

let lastStatus = "En attente d'un pseudo TikTok.";
let conn = null; // connexion TikTok en cours

function broadcast(obj) {
  if (obj.type === 'status') lastStatus = obj.text;
  const data = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

function cleanName(name) {
  const n = String(name || '').trim().replace(/^@/, '');
  return /^[A-Za-z0-9._]{2,24}$/.test(n) ? n : '';
}

function connectTo(name) {
  const username = cleanName(name);
  if (!username) {
    broadcast({ type: 'status', text: 'Pseudo invalide : lettres, chiffres, point ou tiret bas.' });
    return;
  }

  // Ferme l'ancienne connexion, s'il y en a une.
  if (conn) {
    try { conn.disconnect(); } catch (e) { /* déjà fermée */ }
    conn = null;
  }

  const current = new WebcastPushConnection(username);
  conn = current;
  // Un événement n'est transmis que s'il vient de la connexion actuelle.
  const forward = (fn) => (data) => { if (conn === current) fn(data); };

  current.on('gift', forward((data) => {
    // Les cadeaux en série arrivent plusieurs fois : on ne compte qu'à la fin de la série.
    if (data.giftType === 1 && !data.repeatEnd) return;
    const count = data.repeatCount || 1;
    const diamonds = (data.diamondCount || 1) * count;
    console.log(`${data.uniqueId} · ${data.giftName} x${count} (${diamonds} diamants)`);
    broadcast({ type: 'gift', user: data.uniqueId, giftName: data.giftName, diamonds });
  }));

  current.on('like', forward((data) => {
    broadcast({ type: 'like', user: data.uniqueId, count: data.likeCount || 1 });
  }));

  current.on('disconnected', forward(() => {
    conn = null;
    console.log('Déconnecté du live');
    broadcast({ type: 'status', text: 'Déconnecté du live' });
  }));

  current.on('streamEnd', forward(() => {
    conn = null;
    console.log('Le live est terminé');
    broadcast({ type: 'status', text: 'Le live est terminé' });
  }));

  broadcast({ type: 'status', text: `Connexion à @${username}…` });
  current.connect()
    .then(() => {
      console.log(`Connecté au live de @${username}`);
      broadcast({ type: 'status', text: `Connecté au live de @${username}` });
    })
    .catch((err) => {
      console.error('Connexion impossible :', err.message || err);
      if (conn === current) conn = null;
      broadcast({ type: 'status', text: `Pas de live en cours pour @${username}` });
    });
}

wss.on('connection', (ws) => {
  // Le nouveau client reçoit le dernier état connu.
  ws.send(JSON.stringify({ type: 'status', text: lastStatus }));
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
    if (msg.type === 'connect') connectTo(msg.user);
  });
});

server.listen(PORT, () => {
  console.log(`Arène démarrée sur le port ${PORT}`);
});

// Pseudo donné au démarrage (facultatif).
const initial = process.argv[2] || process.env.TIKTOK_USER;
if (initial) connectTo(initial);
