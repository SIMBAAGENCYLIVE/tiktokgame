# Programme de liaison : se connecte à un live TikTok (lecture publique seulement)
# et envoie les événements à la page de l'arène via WebSocket (/ws).
# Le pseudo est saisi sur la page (bouton « Connecter ») ou donné par la variable TIKTOK_USER.

import asyncio
import json
import os
import re
from pathlib import Path

from aiohttp import web, WSMsgType
from TikTokLive import TikTokLiveClient
from TikTokLive.events import ConnectEvent, DisconnectEvent, CommentEvent, GiftEvent, LikeEvent, JoinEvent

PORT = int(os.environ.get("PORT", "8080"))
PAGE = (Path(__file__).parent / "public" / "index.html").read_bytes()
PAGE_VERTICAL = (Path(__file__).parent / "public" / "vertical.html").read_bytes()
PAGE_ACCUEIL = (Path(__file__).parent / "public" / "accueil.html").read_bytes()

clients = set()                 # pages connectées
last_status = "En attente d'un pseudo TikTok."
current_task = None             # connexion TikTok en cours


async def broadcast(obj):
    global last_status
    if obj["type"] == "status":
        last_status = obj["text"]
    data = json.dumps(obj, ensure_ascii=False)
    for ws in list(clients):
        try:
            await ws.send_str(data)
        except Exception:
            clients.discard(ws)


def avatar_of(user):
    """URL de la photo de profil, ou chaîne vide si elle n'est pas disponible."""
    try:
        thumb = getattr(user, "avatar_thumb", None)
        urls = getattr(thumb, "url_list", None) or []
        return urls[0] if urls else ""
    except Exception:
        return ""


def clean(name):
    n = (name or "").strip().lstrip("@")
    return n if re.fullmatch(r"[A-Za-z0-9._]{2,24}", n) else ""


async def connect_to(name):
    global current_task
    username = clean(name)
    if not username:
        await broadcast({"type": "status", "text": "Pseudo invalide : lettres, chiffres, point ou tiret bas."})
        return

    if current_task and not current_task.done():
        current_task.cancel()

    client = TikTokLiveClient(unique_id=f"@{username}")

    async def on_connect(event: ConnectEvent):
        await broadcast({"type": "status", "text": f"Connecté au live de @{username}"})

    async def on_disconnect(event: DisconnectEvent):
        await broadcast({"type": "status", "text": "Déconnecté du live"})

    async def on_comment(event: CommentEvent):
        await broadcast({"type": "chat", "user": event.user.unique_id, "avatar": avatar_of(event.user), "text": event.comment})

    async def on_join(event: JoinEvent):
        await broadcast({"type": "member", "user": event.user.unique_id, "avatar": avatar_of(event.user)})

    async def on_like(event: LikeEvent):
        await broadcast({"type": "like", "user": event.user.unique_id, "avatar": avatar_of(event.user), "count": getattr(event, "count", 1) or 1})

    async def on_gift(event: GiftEvent):
        # Les cadeaux en série arrivent plusieurs fois : on ne compte qu'à la fin de la série.
        if getattr(event, "streaking", False):
            return
        count = getattr(event, "repeat_count", 1) or 1
        value = getattr(event.gift, "diamond_count", 1) or 1
        await broadcast({
            "type": "gift",
            "user": event.user.unique_id,
            "avatar": avatar_of(event.user),
            "giftName": event.gift.name,
            "diamonds": value * count,
        })

    client.add_listener(ConnectEvent, on_connect)
    client.add_listener(DisconnectEvent, on_disconnect)
    client.add_listener(CommentEvent, on_comment)
    client.add_listener(JoinEvent, on_join)
    client.add_listener(LikeEvent, on_like)
    client.add_listener(GiftEvent, on_gift)

    async def run():
        try:
            await client.start()
        except asyncio.CancelledError:
            raise
        except Exception as err:
            # Le message exact est aussi écrit dans les logs Render.
            import traceback
            traceback.print_exc()
            kind = type(err).__name__
            if "Offline" in kind:
                text = f"Pas de live en cours pour @{username}"
            else:
                text = f"Erreur de connexion ({kind}) : {err}"
            await broadcast({"type": "status", "text": text})

    await broadcast({"type": "status", "text": f"Connexion à @{username}…"})
    current_task = asyncio.create_task(run())


async def accueil(request):
    return web.Response(body=PAGE_ACCUEIL, content_type="text/html", charset="utf-8")


async def ballons(request):
    return web.Response(body=PAGE, content_type="text/html", charset="utf-8")


async def vertical(request):
    return web.Response(body=PAGE_VERTICAL, content_type="text/html", charset="utf-8")


async def ws_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    clients.add(ws)
    await ws.send_str(json.dumps({"type": "status", "text": last_status}, ensure_ascii=False))
    try:
        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                except ValueError:
                    continue
                if data.get("type") == "connect":
                    await connect_to(data.get("user"))
    finally:
        clients.discard(ws)
    return ws


async def main():
    app = web.Application()
    app.router.add_get("/", accueil)
    app.router.add_get("/ballons", ballons)
    app.router.add_get("/vertical", vertical)
    app.router.add_get("/ws", ws_handler)
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "0.0.0.0", PORT).start()
    print(f"Arène démarrée sur le port {PORT}")

    initial = os.environ.get("TIKTOK_USER")
    if initial:
        await connect_to(initial)
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
