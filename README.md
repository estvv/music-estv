# music-estv

Quiz musicaux entre amis : Songless quotidien (commun et « mon Spotify »), Songless libre et blind test sur n'importe quelle playlist, classements, et soirées où les invités rejoignent par QR code (blind test en QCM, saisie ou buzzer, Songless, et « Qui a liké ça ? »). Installable sur téléphone (PWA). Spécification complète dans [`docs/PROJECT.md`](docs/PROJECT.md).

Pas d'inscription : l'admin crée les comptes. L'audio vient des extraits Deezer, et Spotify (optionnel) sert à lire les goûts de chacun.

## Stack

- Backend : Node 24, Express, TypeScript, PostgreSQL 17 (conteneur `db`, volume `pgdata`)
- Frontend : React 19, Vite, Tailwind v4, servi par nginx qui proxifie `/api`
- Docker Compose sur `caddy_net`, derrière Caddy (`music-frontend-estv:80`)

## Mise en route sur le VPS

```bash
cd ~/projects && git clone git@github.com:estvv/music-estv.git && cd music-estv
cp .env.example .env          # remplir PUBLIC_URL, TOKEN_ENCRYPTION_KEY et POSTGRES_PASSWORD (openssl rand -hex 32 / -hex 24)
docker compose up -d --build
docker compose exec backend npm run db:fixtures   # compte admin (ADMIN_USERNAME) + une première playlist, affiche le mot de passe généré
```

Ensuite :

1. Ajouter le domaine dans le Caddyfile avec `reverse_proxy music-frontend-estv:80`, puis recharger Caddy.
2. Se connecter : le site demande d'abord de remplacer le mot de passe généré. Les fixtures ont déjà importé « Top Worldwide » (Deezer) ; d'autres playlists s'ajoutent dans **Playlists → Ajouter**.
3. Créer les comptes des amis dans **Admin → Comptes**.

### Spotify (optionnel)

1. Sur https://developer.spotify.com/dashboard, créer une app (Web API et Web Playback SDK).
2. Ajouter la Redirect URI `${PUBLIC_URL}/api/spotify/callback`, et `http://127.0.0.1:5173/api/spotify/callback` pour le dev.
3. Dans **User Management**, ajouter le compte Spotify de chaque ami (5 maximum en mode développement ; le propriétaire de l'app doit avoir Premium).
4. Remplir `SPOTIFY_CLIENT_ID` et `SPOTIFY_CLIENT_SECRET` dans `.env`, puis lancer `docker compose up -d`.

Sans Spotify, tout fonctionne, sauf l'import de playlists Spotify et « Qui a liké ça ? ».

## Dev local

```bash
docker compose up           # http://127.0.0.1:8094, modifications en direct, logs dans le terminal
docker compose exec backend npm run db:fixtures   # (autre terminal) premier lancement : admin + une première playlist
```

En local, `docker compose up` charge `docker-compose.override.yml` (gitignoré) : au lieu des images de production, il lance les serveurs de dev sur les sources montées. Le frontend utilise Vite avec rechargement à chaud, et le backend redémarre à chaque sauvegarde grâce à `tsx watch`. **Pas besoin de rebuild** : seul un changement de `package.json` demande `docker compose restart backend` (ou `frontend`).

PostgreSQL tourne dans le conteneur `db`, avec ses données dans le volume `pgdata` : `docker compose down -v` efface la base. En dev, il est exposé sur `127.0.0.1:5434` (identifiant `music`, mot de passe `POSTGRES_PASSWORD` du `.env`), ce qui permet de lancer `npm run db:fixtures` et `npm test` depuis `backend/` sur ta machine.

Sans Docker : `make install`, puis `make backend` (:3013) et `make frontend` (http://127.0.0.1:5173). Utilise `127.0.0.1` et non `localhost` : c'est nécessaire pour le callback Spotify.

Aperçu avec de faux joueurs, en local uniquement : `docker compose exec backend npm run db:demo` crée 8 joueurs `demo_…` avec 45 jours de parties (Songless, blind test, soirées) ; `npm run db:demo -- --clean` les supprime. Le script refuse de tourner en production.

Mot de passe admin perdu : `docker compose exec backend npm run create-admin -- <identifiant>` en génère un nouveau.

Tests : `cd backend && npm test`.
