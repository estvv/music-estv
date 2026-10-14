# Cahier des charges — music-estv

> Plateforme de jeux musicaux entre amis, hébergée sur le VPS perso.
> Inspirée de [Songless](https://playdaily.org/songless).
>
> **Rédigé le 2026-10-14**, lots 1 à 4 livrés le même jour (voir § 8) à l'issue d'une session de cadrage. Les décisions ci-dessous sont arrêtées ;
> les points encore ouverts sont listés au § 10.

---

## 1. Objectif

Un site privé où un petit groupe (< 10 personnes) joue à des quiz musicaux :

- **en solo**, avec un Songless quotidien commun, un Songless quotidien « mon Spotify », un mode libre, et des classements ;
- **en soirée**, sur le modèle de Kahoot : un compte hôte crée un salon et l'affiche sur une TV ou un PC, qui joue la musique ; les invités scannent un QR code, saisissent un pseudo et répondent depuis leur téléphone.

## 2. Comptes

| Règle | Détail |
|---|---|
| Pas d'inscription publique | Aucune route ne crée de compte, à part celles réservées à l'admin. |
| Premier admin | Créé en ligne de commande : `npm run create-admin -- <identifiant>`, qui affiche le mot de passe généré. |
| Création de comptes | L'admin crée un compte (identifiant + nom affiché) et reçoit un **mot de passe généré** à transmettre. La personne peut le changer depuis son profil. |
| Gestion | L'admin peut réinitialiser le mot de passe d'un compte, le désactiver ou le promouvoir admin. |
| Mot de passe | Hashé avec scrypt (`node:crypto`, sans dépendance native). |
| Session | Jeton aléatoire de 32 octets dans un cookie `httpOnly`, `SameSite=Lax`, valable 30 jours. Seul le **sha256** du jeton est stocké en base, ce qui rend les sessions révocables. |
| Brute force | Limite de débit dédiée sur `/api/auth/login` : 10 essais par tranche de 15 min et par IP. |
| Invités de soirée | Pas de compte : un pseudo et un jeton de joueur limités à un salon (§ 6). |

## 3. Sources musicales : Spotify et Deezer

### 3.1 Contraintes de Spotify (état en octobre 2026)

Les changements du mode développement de février 2026, assouplis en partie en juillet 2026, conditionnent toute l'architecture :

- Une app en mode dev est limitée à **5 utilisateurs** inscrits dans le dashboard Spotify, et son propriétaire doit avoir **Premium**.
- `preview_url` n'est plus fourni aux nouvelles apps : **Spotify ne fournit plus d'extraits audio.**
- Le contenu d'une playlist (`GET /playlists/{id}/items`) n'est lisible **que pour les playlists que l'utilisateur possède ou dont il est collaborateur**. Les playlists éditoriales et celles des autres sont donc inaccessibles.
- Les champs `popularity` ont été supprimés. L'ISRC (`external_ids`) a été supprimé puis **rétabli** en mars 2026.
- Les endpoints suivants restent disponibles : `GET /me`, `/me/top/tracks`, `/me/tracks`, `/me/playlists`, `/me/player/*`, ainsi que le Web Playback SDK (qui exige Premium).

### 3.2 Répartition des rôles

| Rôle | Source |
|---|---|
| **Audio des extraits** (solo, téléphones) | **Deezer** : extrait MP3 de 30 s, gratuit et sans authentification. |
| **Audio en salon sur l'écran de l'hôte** | Spotify Web Playback SDK si l'hôte a lié un compte Premium, sinon Deezer. |
| **Goûts personnels** (top, likes, playlists perso) | Spotify, lié par compte. |
| **Catalogue, recherche, autocomplétion** | Deezer `/search`, qui renvoie un classement de popularité (`rank`) utile pour la difficulté. |
| **Pool du daily commun** | Playlists Deezer publiques (n'importe laquelle, y compris éditoriale) ou playlists Spotify de l'admin. |

La correspondance Spotify → Deezer passe par l'ISRC (`GET api.deezer.com/track/isrc:<ISRC>`). Si le titre trouvé n'est pas `readable` ou n'a pas d'extrait, on se rabat sur une recherche `artist:"…" track:"…"`. La correspondance est mise en cache dans la table `tracks`.

Les URL d'extrait Deezer sont **signées et expirent au bout d'environ 15 min**. On ne les stocke jamais : elles sont récupérées à la demande.

### 3.3 Liaison Spotify

- Flux OAuth « Authorization Code » côté serveur (secret client dans l'environnement).
- Scopes demandés en une seule fois, pour ne pas avoir à re-lier plus tard : `user-top-read user-library-read playlist-read-private playlist-read-collaborative streaming user-read-playback-state user-modify-playback-state`.
- Le paramètre `state` est signé et lié à la session, pour se protéger du CSRF.
- Les jetons d'accès et de rafraîchissement sont **chiffrés en AES-256-GCM** (clé `TOKEN_ENCRYPTION_KEY`) et rafraîchis automatiquement.
- L'utilisateur peut délier son compte à tout moment depuis son profil. Les 5 places Spotify sont gérées à la main dans le dashboard Spotify ; un compte sans Spotify joue à tout sauf au daily perso et à « Qui a liké ça ? ».

## 4. Les jeux

### 4.1 Songless (lot 1)

On entend un extrait qui s'allonge et on doit trouver le titre.

- **Paliers d'écoute :** 0,1 s → 0,5 s → 1 s → 2 s → 4 s → 8 s → 16 s, soit 7 essais.
- Une mauvaise réponse ou un « Passer » débloque le palier suivant. Après le 7ᵉ échec, la réponse est révélée.
- **Score :** 7 points si trouvé au palier 1, 1 point au palier 7, 0 en cas d'échec.
- **Saisie :** champ texte avec autocomplétion sur le catalogue Deezer. Une réponse est juste si c'est le même titre Deezer **ou** le même couple titre + artiste normalisé : sans accents ni casse, sans « (Remastered) », « - Live », « feat. »… Le jeu accepte ainsi les rééditions.
- **Anti-triche :** le client ne reçoit jamais les métadonnées du titre avant la fin de la partie. L'audio passe par `/api/songless/:id/audio`, qui ne sert que **les octets correspondant au palier débloqué** (le MP3 en débit constant est découpé proportionnellement à la durée). L'état de la partie est conservé côté serveur.
- **Modes :**
  - **Daily commun :** un titre par jour, identique pour tous, tiré de façon déterministe du pool admin. Une seule partie par jour et par compte.
  - **Daily perso :** un titre par jour tiré du top et des likes Spotify du compte. Nécessite Spotify.
  - **Libre :** parties illimitées, tirées du pool ou d'une source choisie (playlist Deezer, ou une de mes playlists Spotify). Le score compte dans un classement séparé.
- **Partage :** résultat copiable façon Wordle, par exemple `music-estv #42 🟥🟥🟩⬜⬜⬜⬜ 5/7`.

### 4.2 Blind test (lot 2)

Une série de N extraits (10 par défaut) de 15 s chacun. Le joueur gagne des points selon la rapidité et l'exactitude :

- titre juste : 1 point ;
- artiste juste : 1 point ;
- bonus de vitesse.

Il se joue en solo ou en salon. Le mode de réponse se choisit à la création : saisie avec autocomplétion, QCM à 4 choix (les leurres sont tirés du même pool, de popularité proche) ou buzzer.

### 4.3 Quiz depuis une playlist (lot 2)

Le joueur choisit une source parmi :

- une de ses playlists Spotify (seulement celles qu'il possède, voir § 3.1) ;
- une playlist Deezer, par URL ;
- ses titres likés.

Le jeu en tire un blind test ou un Songless libre. Cela crée une **« Source »** réutilisable, partageable avec les autres comptes.

### 4.4 Qui a liké ça ? (lot 3)

Uniquement en salon, entre comptes reliés à Spotify (2 minimum). On joue un titre tiré du top ou des likes d'un des comptes participants, et il faut deviner à qui il appartient. Les titres présents chez plusieurs personnes sont soit exclus, soit acceptent plusieurs bonnes réponses.

### 4.5 Classements

- **Daily commun :** score du jour, série de jours consécutifs, moyenne, histogramme des paliers (comme Wordle).
- **Toutes périodes :** somme des scores au daily commun, et classement séparé pour le mode libre.
- Seuls les comptes apparaissent dans les classements ; les invités de soirée n'ont qu'un classement de fin de partie.

## 5. Salons de soirée (lot 3)

```
  TV / PC de l'hôte (connecté)                Téléphones invités (pas de compte)
  ┌─────────────────────────────┐             ┌────────────────────┐
  │ /room/ABCD/host             │             │ /join/ABCD         │
  │  - QR code + code ABCD      │  scan  ──►  │  pseudo → lobby    │
  │  - liste des joueurs        │             │  réponse / buzzer  │
  │  - audio (Spotify ou Deezer)│             │  score perso       │
  │  - question, chrono, scores │             └────────────────────┘
  └─────────────────────────────┘
              ▲  WebSocket (ws)  ▼
       Serveur : état du salon en mémoire, horloge de référence
```

- Le salon est créé par un compte connecté, qui choisit le jeu (Songless, Blind test, Qui a liké ça ?), la source et le mode de réponse. Le code fait 4 lettres, sans caractères ambigus.
- Le QR code encode `https://<domaine>/join/ABCD`. Un invité saisit un pseudo et reçoit un jeton de joueur stocké en `sessionStorage` : si le téléphone se met en veille, il peut se reconnecter et récupérer son score.
- **Le serveur fait autorité :** il fixe le titre, le moment où la manche commence (horodatage serveur) et valide les réponses. Le score de vitesse se calcule à la réception côté serveur.
- **Audio uniquement sur l'écran de l'hôte.** Les téléphones n'en reçoivent jamais : on évite le décalage et le bruit, et personne ne peut lire l'audio dans l'onglet réseau.
- Avec Spotify (hôte Premium), le Web Playback SDK lit `spotify:track:…` à la position de départ choisie. Sinon, l'audio vient de l'extrait Deezer, servi à l'hôte par le proxy audio.
- **Buzzer :** le premier buzz (horodatage serveur) bloque les autres ; l'hôte valide ✔ ou refuse ✘ depuis son écran.
- **Fin de partie :** podium, puis l'hôte relance une partie ou ferme le salon. Un salon inactif depuis 2 h est purgé de la mémoire. Le score des joueurs connectés à un compte est enregistré dans leur historique.

## 6. Architecture technique

Même stack et même déploiement que `quizz-estv` et `calendar-estv` :

- **Backend :** Node 24, Express, TypeScript, PostgreSQL 17 via `pg` (SQL brut, sans ORM), `ws` pour les salons (lot 3). Port 8080 dans le conteneur, 3013 en local.
- **Frontend :** React 19, Vite, Tailwind v4, react-router. Le build est servi par nginx, qui proxifie `/api` (et `/ws` au lot 3) vers le backend.
- **Déploiement :** Docker Compose sur `caddy_net`, Caddy en frontal pour le TLS.
- **Données :** PostgreSQL dans un conteneur `db` à part, sur un réseau Docker privé et avec un volume nommé (`pgdata`). Le schéma est appliqué au démarrage de façon idempotente (`CREATE … IF NOT EXISTS`). Les tests tournent sur un vrai Postgres, chaque fichier dans un schéma jetable.

### 6.1 Modèle de données (lot 1)

```
users(id, username UNIQUE, display_name, password_hash, is_admin,
      disabled, created_at)
sessions(token_hash PK, user_id → users, created_at, expires_at)
spotify_links(user_id PK → users, spotify_user_id, spotify_name,
              access_token_enc, refresh_token_enc, expires_at, scope, linked_at)
tracks(id, deezer_id UNIQUE, isrc, spotify_id, title, artist, album,
       cover_url, duration, rank, created_at)        -- cache catalogue
sources(id, kind['deezer_playlist'|'spotify_playlist'], ref, name,
        in_daily_pool, owner_id → users, synced_at, created_at)
source_tracks(source_id → sources, track_id → tracks) PK(source_id, track_id)
daily_puzzles(day, scope['global'|'user:<id>'], track_id → tracks) PK(day, scope)
songless_games(id, user_id → users, mode['daily'|'daily_personal'|'free'],
               day NULL, track_id → tracks, step, guesses JSON,
               status['playing'|'won'|'lost'], score, created_at, finished_at)
               UNIQUE(user_id, mode, day) quand day non NULL
```

### 6.2 API (lot 1)

| Méthode | Route | Accès |
|---|---|---|
| POST | `/api/auth/login` · `/api/auth/logout` | public / connecté |
| GET | `/api/auth/me` | connecté |
| POST | `/api/auth/password` | connecté |
| GET/POST | `/api/admin/users` | admin |
| PATCH | `/api/admin/users/:id` (reset, désactivation, admin) | admin |
| GET/POST/DELETE | `/api/admin/sources` (+ `/:id/sync`) | admin |
| GET | `/api/spotify/connect` → redirection · `/api/spotify/callback` | connecté |
| DELETE | `/api/spotify` | connecté |
| GET | `/api/spotify/playlists` | connecté |
| GET | `/api/songless/search?q=` (autocomplétion Deezer) · `/api/songless/sources` · `/api/songless/today` | connecté |
| POST | `/api/songless/start` `{mode, sourceId?}` | connecté |
| GET | `/api/songless/:id` (état, sans le titre tant que la partie est en cours) | propriétaire |
| GET | `/api/songless/:id/audio` (octets du palier courant) | propriétaire |
| POST | `/api/songless/:id/guess` `{deezerId}` · `/skip` | propriétaire |
| GET | `/api/leaderboard/daily?day=` · `/api/leaderboard/all` | connecté |
| GET | `/api/leaderboard/me` (statistiques perso) | connecté |

### 6.3 Sécurité

- `helmet`. La CSP de nginx autorise `img-src` pour les pochettes `cdn-images.dzcdn.net` / `i.scdn.co`, `media-src 'self' blob:`, et `script-src` pour `sdk.scdn.co` (Web Playback, lot 3).
- Toutes les routes sauf `/api/auth/login` exigent une session. Les invités ne passent que par le WebSocket du salon.
- Les mutations n'acceptent que du JSON, avec une vérification de l'en-tête `Origin` en plus de `SameSite=Lax`.
- Les secrets passent par `.env` : `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `PUBLIC_URL`, `TOKEN_ENCRYPTION_KEY`.

## 7. Direction visuelle

Même langage visuel que `quizz-estv`, `calendar-estv` et `news-estv` : fond blanc, gris neutres, police Plus Jakarta Sans, boutons principaux `neutral-900`, bordures `neutral-200` en `rounded-lg`, emerald pour la réussite et la progression, rouge pour les erreurs. L'interface est en français. Les écrans de salon côté hôte (lot 3) reprennent ce style avec des caractères agrandis, lisibles à 3 m, et les écrans invités sont pensés pour le mobile : un seul gros bouton par action.

## 8. Lots de livraison

| Lot | Contenu | État |
|---|---|---|
| **1. MVP** | Comptes et admin, liaison Spotify, catalogue Deezer, sources du pool, Songless (daily commun, daily perso, libre), classements, statistiques | Fait |
| **2** | Blind test solo (QCM ou saisie), playlists partagées (Deezer, playlists Spotify perso, titres likés), Songless libre et blind test sur n'importe quelle playlist | Fait |
| **3** | Salons temps réel (WebSocket `/ws`), QR code, écran hôte (son Deezer, ou Spotify Web Playback en option), QCM, saisie ou buzzer, Qui a liké ça ? | Fait |
| **4** | Songless en salon (extraits de plus en plus longs, une tentative par extrait), classement final des soirées enregistré pour les comptes (colonne Soirées), option « Tubes uniquement » (moitié la plus populaire d'une playlist selon le `rank` Deezer), PWA installable | Fait |

## 9. Configuration Spotify (à faire une fois)

1. Sur developer.spotify.com, créer une app avec le type d'API « Web API » et « Web Playback SDK ».
2. Ajouter les Redirect URIs `https://<domaine>/api/spotify/callback` et, pour le dev local, `http://127.0.0.1:5173/api/spotify/callback`. Spotify refuse `localhost` mais accepte la boucle locale `127.0.0.1`.
3. Dans « User Management », ajouter le nom et l'e-mail Spotify de chaque ami (5 maximum).
4. Reporter le Client ID et le Client Secret dans `.env`.

## 10. Questions encore ouvertes

- Sous-domaine définitif : `music.<domaine>` ?
- Faut-il, au lot 3, permettre à un **compte** de rejoindre un salon pour que son score soit comptabilisé ? (Actuellement : pseudo seul, avec enregistrement si la personne est déjà connectée.)
- Faut-il une file d'attente de titres choisie à la main par l'hôte en soirée, en plus des sources ?
