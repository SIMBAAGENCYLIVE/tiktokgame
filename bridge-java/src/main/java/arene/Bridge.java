package arene;

import io.github.jwdeveloper.tiktok.TikTokLive; // à vérifier : nom du paquet dans le README
import io.javalin.Javalin;
import io.javalin.websocket.WsConnectContext;
import io.javalin.websocket.WsContext;
import io.javalin.websocket.WsCloseContext;
import io.javalin.websocket.WsMessageContext;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Programme de liaison : se connecte à un live TikTok (lecture publique seulement)
// et transmet les événements à la page de l'arène via WebSocket (/ws).
// Le pseudo est saisi sur la page (bouton « Connecter ») ou donné par la variable TIKTOK_USER.
public class Bridge {

    static final Set<WsContext> clients = ConcurrentHashMap.newKeySet();
    static volatile String lastStatus = "En attente d'un pseudo TikTok.";
    static volatile Object currentClient = null;
    static final Pattern USER_FIELD = Pattern.compile("\"user\"\\s*:\\s*\"([^\"]*)\"");
    static final Pattern NAME_FIELD = Pattern.compile("\"type\"\\s*:\\s*\"connect\"");

    public static void main(String[] args) throws Exception {
        String page = Files.readString(Path.of("public", "index.html"));
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));

        Javalin app = Javalin.create()
            .get("/", ctx -> ctx.html(page))
            .ws("/ws", ws -> {
                ws.onConnect((WsConnectContext ctx) -> {
                    clients.add(ctx);
                    ctx.send(statusJson(lastStatus));
                });
                ws.onClose((WsCloseContext ctx) -> clients.remove(ctx));
                ws.onMessage((WsMessageContext ctx) -> {
                    String msg = ctx.message();
                    if (!NAME_FIELD.matcher(msg).find()) return;
                    Matcher m = USER_FIELD.matcher(msg);
                    if (m.find()) connectTo(m.group(1));
                });
            })
            .start(port);

        System.out.println("Arène démarrée sur le port " + port);

        String initial = System.getenv("TIKTOK_USER");
        if (initial != null && !initial.isBlank()) connectTo(initial);
    }

    static String cleanName(String name) {
        String n = name == null ? "" : name.trim().replaceFirst("^@", "");
        return n.matches("[A-Za-z0-9._]{2,24}") ? n : "";
    }

    static void connectTo(String name) {
        String username = cleanName(name);
        if (username.isEmpty()) {
            status("Pseudo invalide : lettres, chiffres, point ou tiret bas.");
            return;
        }
        disconnectCurrent();
        status("Connexion à @" + username + "…");

        new Thread(() -> {
            try {
                var client = TikTokLive.newClient(username)
                    .onConnected((c, e) -> status("Connecté au live de @" + username))
                    .onDisconnected((c, e) -> {
                        currentClient = null;
                        status("Déconnecté du live");
                    })
                    .onComment((c, e) -> broadcast("{\"type\":\"chat\",\"user\":" + q(e.getUser().getName())
                        + ",\"text\":" + q(e.getText()) + "}"))
                    .onJoin((c, e) -> broadcast("{\"type\":\"member\",\"user\":"
                        + q(e.getUser().getName()) + "}"))
                    .onLike((c, e) -> broadcast("{\"type\":\"like\",\"user\":" + q(e.getUser().getName())
                        + ",\"count\":" + e.getLikeCount() + "}"))
                    .onGift((c, e) -> {
                        int count = Math.max(1, e.getRepeatCount());
                        int diamonds = Math.max(1, e.getGift().getDiamondCount()) * count;
                        System.out.println(e.getUser().getName() + " · " + e.getGift().getName()
                            + " x" + count + " (" + diamonds + " diamants)");
                        broadcast("{\"type\":\"gift\",\"user\":" + q(e.getUser().getName())
                            + ",\"giftName\":" + q(e.getGift().getName())
                            + ",\"diamonds\":" + diamonds + "}");
                    })
                    .buildAndConnect();
                currentClient = client;
            } catch (Exception err) {
                System.err.println("Connexion impossible : " + err.getMessage());
                currentClient = null;
                status("Pas de live en cours pour @" + username);
            }
        }).start();
    }

    static void disconnectCurrent() {
        Object c = currentClient;
        currentClient = null;
        if (c instanceof AutoCloseable ac) {
            try { ac.close(); } catch (Exception ignored) { }
        }
    }

    static void status(String text) {
        lastStatus = text;
        broadcast(statusJson(text));
    }

    static String statusJson(String text) {
        return "{\"type\":\"status\",\"text\":" + q(text) + "}";
    }

    static void broadcast(String json) {
        for (WsContext ctx : clients) {
            try {
                ctx.send(json);
            } catch (Exception ignored) {
                clients.remove(ctx);
            }
        }
    }

    // Échappe une chaîne pour JSON.
    static String q(String s) {
        if (s == null) return "\"\"";
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> b.append("\\\"");
                case '\\' -> b.append("\\\\");
                case '\n' -> b.append("\\n");
                case '\r' -> b.append("\\r");
                case '\t' -> b.append("\\t");
                default -> {
                    if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
                    else b.append(c);
                }
            }
        }
        return b.append('"').toString();
    }
}
