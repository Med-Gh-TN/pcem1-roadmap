<div align="center">

# 🩺 PCEM1 Medical Learning Roadmap & AI Workstation

<p align="center">
  <b>Portail d'Étude Interactif & Assistant IA pour les Étudiants en Médecine (FMT Tunisia)</b>
</p>

[![Live Production](https://img.shields.io/badge/Production-Live_App-0284c7?style=for-the-badge&logo=render&logoColor=white)](https://pcem1-roadmap.onrender.com)
[![Python Version](https://img.shields.io/badge/Python-3.12.2-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.1.3-000000?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon.tech-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech/)
[![Cloudflare R2](https://img.shields.io/badge/CDN-Cloudflare_R2-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://www.cloudflare.com/developer-platform/r2/)
[![Google Gemini](https://img.shields.io/badge/AI-Google_Gemini-8E7CC3?style=for-the-badge&logo=google-gemini&logoColor=white)](https://ai.google.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

<br/>

<a href="https://pcem1-roadmap.onrender.com"><strong>🚀 Accéder au Portail Live »</strong></a>

<br/>

</div>

---

## 📖 Vue d'Ensemble (Overview)

Le **PCEM1 Medical Learning Roadmap & AI Workstation** est une plate-forme web haute performance conçue sur mesure pour les étudiants en première année de médecine (PCEM1) à la **Faculté de Médecine de Tunis (FMT)**. 

Elle regroupe **451 ressources pédagogiques officielles** (poly-copiés, diaporamas de cours, séances de TD/TP, enregistrements vidéo MP4, et annales d'examens) organisées dynamiquement selon la matrice officielle des coefficients et sessions de la faculté.

### 🌟 Points Forts
- 📖 **Espace de Travail Scindé (Split-Screen Workbench) :** Visionnez les supports de cours (PDF/MP4) directement via un CDN Cloudflare R2 tout en prenant des notes mnémoniques synchronisées.
- 🤖 **Tuteur Vocale & Textuel IA (Gemini Live) :** Interaction vocale bidirectionnelle en temps réel via WebSockets (`flask-sock`), capable d'adapter ses explications aux notes de l'étudiant et d'expliquer les concepts complexes (français & darja).
- ✨ **Génération de Fiches & QCMs Interactifs :** Création de fiches de révision HTML et de QCMs avec explications cliniques alimentée par Gemini et un système de secours dynamique (Circuit Breaker).
- 🔥 **Gamification & Suivi de Maîtrise :** Calculateur de score pondéré par coefficient de faculté, suivi de streak quotidien avec carte thermique (GitHub-style heatmap), et timer Pomodoro intégré.
- ⚡ **Mise à Jour Optimiste (Optimistic UI) :** Réponses d'interface instantanées (<10ms) sans rechargement de page.

---

## 🏗️ Architecture Système (3-Tier Zero-Cost Stack)

L'application repose sur une architecture moderne entièrement découplée et optimisée pour fonctionner **gratuitement à 100%** en production :

```mermaid
flowchart TD
    subgraph Client ["Client Navigateur (Vanilla ES6 JS)"]
        UI["Interface Dashboard & Vue Programme"]
        WB["Espace de Travail Scindé (workbench.js)"]
        QP["Moteur de Quiz QCM (qcm_player.js)"]
        TUTO_UI["Tuteur IA Vocale/Textuelle (tuto.js)"]
    end

    subgraph CDN ["Réseau CDN (Cloudflare R2 Storage)"]
        R2["Bucket Public 'pcem1-assets'\n(453 Fichiers Médias - $0 Egress)"]
    end

    subgraph AppServer ["Serveur d'Application (Render Web Service)"]
        APP["app.py / Routeur Principal"]
        GUNI["Gunicorn WSGI (2 Workers, 4 Threads)"]
        C_ROADMAP["roadmap_routes.py"]
        C_GAMIFY["gamification_routes.py"]
        C_AI["ai_routes.py"]
        C_TUTO["tuto_routes.py (WebSockets)"]
        
        S_AI["ai_agent.py (RAG & Circuit Breaker)"]
        S_CONV["converter_service.py (PyMuPDF / Fitz)"]
        S_MASTERY["mastery_engine.py"]
        S_ORG["organizer.py (Crawler R2-Aware)"]
    end

    subgraph DataTier ["Base de Données (Neon PostgreSQL)"]
        PG[("Neon PostgreSQL + PgBouncer Pooler\n(resources, study_logs, theme_notes,\ncourse_summaries, qcm_history)")]
    end

    subgraph External ["APIs Externes"]
        GEMINI["Google Gemini Studio API\n(Gemini 3.1 Flash / Gemma / Live WS)"]
    end

    UI -->|HTTP GET /api/roadmap| C_ROADMAP
    WB -->|Direct HTTPS Stream| R2
    WB -->|HTTP POST /api/progress| C_ROADMAP
    QP -->|HTTP POST /api/qcm/submit| C_GAMIFY
    
    C_TUTO <-->|WebSocket /ws/tuto| TUTO_UI
    C_TUTO <-->|Bidirectional PCM Audio / Text Stream| GEMINI

    C_AI -->|SSE /api/ai/summarize, /quiz| S_AI
    S_AI -->|Extraction RAG PDF via PyMuPDF| S_AI
    S_AI -->|Requêtes REST / SSE| GEMINI

    C_ROADMAP -->|Requêtes SQL| PG
    C_GAMIFY -->|Requêtes SQL| PG
    C_AI -->|Cache HTML Summaries| PG

    S_ORG -->|Sync Ressources| PG
    C_GAMIFY -->|Évaluation Mathématique| S_MASTERY
```

### Détail des 3 Tiers
1. **Tier 1 — App Server (Render) :** Hébergement Python 3.12.2 sous WSGI Gunicorn multi-threadé (`--threads 4`). Traite l'API REST, le rendu Jinja2, et les connexions WebSockets `flask-sock`.
2. **Tier 2 — Database (Neon.tech PostgreSQL) :** Base de données serverless gérant 451 ressources de cours et les données de gamification. Utilise le pooler de connexions **PgBouncer** (`-pooler`) pour éliminer le temps de poignée de main SSL.
3. **Tier 3 — Asset CDN (Cloudflare R2) :** Hébergement des 453 fichiers lourds (PDFs et vidéos MP4) sur le réseau mondial Cloudflare R2 avec **aucun frais d'égress (bande passante $0)**.

---

## 📁 Structure du Projet

```text
PCEM1/
├── app.py                      # Usine principale Flask, enregistrement des Blueprints & redirections R2
├── run.py                      # Orchestrateur local autoreparateur (venv, pip, discovery de ports)
├── requirements.txt            # Versions strictes des dépendances production
├── .python-version             # Verrouillage du runtime Python (3.12.2)
├── .exemple.env                # Modèle des variables d'environnement
├── .gitignore                  # Exclusion stricte des clés, venv, DB locales et fichiers medias
├── cirucilum.txt               # Empreinte textuelle de l'ontologie du programme FMT
├── controllers/                # Contrôleurs HTTP & WebSockets (Flask Blueprints)
│   ├── ai_routes.py            # Endpoints SSE streaming (Quiz, Explain, Summarize)
│   ├── gamification_routes.py  # Endpoints pour streaks, heatmap, logs d'étude et notes
│   ├── roadmap_routes.py       # Endpoints d'indexation du programme, recherche et conversion
│   └── tuto_routes.py          # Contrôleur WebSocket pour l'Assistant Vocal Gemini Live
├── repository/                 # Couche d'Accès aux Données (DAL)
│   ├── db.py                   # Gestionnaire de connexion PostgreSQL Neon (psycopg2)
│   ├── roadmap_repo.py         # Mappings SQL pour la table resources & caches de résumés
│   └── user_data_repo.py       # Mappings SQL pour les logs d'étude, notes et historiques QCM
├── services/                   # Couche Métier (Domain Services)
│   ├── ai_agent.py             # Moteur RAG PyMuPDF, parseur TOON et Circuit Breaker Gemini
│   ├── converter_service.py    # Service de conversion de documents Office vers PDF (LibreOffice/Fitz)
│   ├── mastery_engine.py       # Algorithme mathématique d'évaluation de la maîtrise
│   └── organizer.py            # Crawler d'indexation sémantique et inférence taxonomique
├── scripts/                    # Scripts d'Infrastructure et de Migration
│   ├── migrate_sqlite_to_neon.py # Utility de migration SQLite locale vers Neon PostgreSQL
│   ├── upload_to_r2.py         # Bulk Uploader automatisé Boto3 vers Cloudflare R2
│   └── update_r2_urls.py       # Transformateur de chemins DB vers les URLs CDN R2
├── prompts/                    # Templates Jinja2 d'Ingénierie de Prompt
│   ├── concept_explainer.jinja
│   ├── course_summarizer.jinja
│   ├── qcm_generator.jinja
│   └── tuto_system_prompt.jinja
├── static/                     # Assets Statiques Frontend
│   ├── css/
│   │   └── style.css           # Tokens de design Apple HIG + Glassmorphism & Heatmap CSS
│   └── js/
│       ├── api.js              # Client HTTP Asynchrone & Moteur Streaming SSE
│       ├── main.js             # Moteur de rendu principal & liaison au DOM global
│       ├── core/
│       │   └── state.js        # Gestionnaire d'état centralisé
│       └── features/
│           ├── gamification.js # Timers Pomodoro & calculs du Heatmap
│           ├── qcm_player.js   # Moteur de rendu interactif des QCMs
│           ├── roadmap.js      # Contrôleur des vues Grille & Chronologie
│           ├── tuto.js         # Capture audio PCM 16kHz & rendu du Tuteur Vocal
│           └── workbench.js    # Lecteur de médias scindé & mises à jour optimistes
└── templates/                  # Templates HTML Jinja2
    ├── index.html              # Vue principale Single-Page Application (SPA)
    ├── components/
    │   ├── header.html         # Barre de navigation, widget Pomodoro & progression
    │   ├── modals.html         # Modales génériques & modale IA
    │   └── workbench.html      # Modal Espace de Travail scindé
    └── layout/
        └── base.html           # Layout HTML5 de base
```

---

## 🛠️ Variables d'Environnement

Créez un fichier `.env` à la racine du projet basiques sur le modèle ci-dessous :

| Variable | Requis | Description | Exemple |
|---|---|---|---|
| `GEMINI_API_KEY` | **Oui** | Clé API Google AI Studio | `AIzaSy...` |
| `GEMINI_MODELS` | **Oui** | Chaîne de repli du Circuit Breaker | `gemini-3.1-flash-lite,gemma-4-31b-it,gemma-4-26b-a4b-it` |
| `DATABASE_URL` | **Oui** | Chaîne PostgreSQL Neon (Utiliser `-pooler`) | `postgresql://user:pass@ep-name-pooler.region.aws.neon.tech/neondb?sslmode=require` |
| `R2_PUBLIC_URL` | **Oui** | Domaine public CDN Cloudflare R2 | `https://pub-xxxxxx.r2.dev` |
| `R2_ACCOUNT_ID` | Non* | ID de compte Cloudflare (pour script uploader) | `ee06704270b5c49d3941a5c7c41a78cb` |
| `R2_ACCESS_KEY_ID` | Non* | Clé d'accès S3 API Cloudflare | `f5f8541223c6ec0...` |
| `R2_SECRET_ACCESS_KEY` | Non* | Clé secrète S3 API Cloudflare | `77c0839e6e816286...` |
| `R2_BUCKET_NAME` | Non* | Nom du bucket R2 | `pcem1-assets` |
| `PORT` | Non | Port d'écoute du serveur web | `5000` |

*\* Requis uniquement lors de l'exécution du script `scripts/upload_to_r2.py`.*

---

## 💻 Configuration & Lancement Local

### 1. Cloner le Dépôt
```bash
git clone https://github.com/Med-Gh-TN/pcem1-roadmap.git
cd pcem1-roadmap
```

### 2. Lancement Automatisé (Recommandé)
Le projet intègre un orchestrateur auto-réparateur (`run.py`) qui configure automatiquement l'environnement virtuel `.venv`, installe les dépendances requises, détecte les ports libres et lance le serveur avec ouverture automatique de Chrome :

```bash
python3 run.py
```

### 3. Installation Manuelle
Si vous préférez exécuter l'application manuellement :

```bash
# Créer et activer l'environnement virtuel
python3 -m venv .venv
source .venv/bin/activate  # Sur Linux/macOS
# .venv\Scripts\activate   # Sur Windows

# Installer les dépendances
pip install -r requirements.txt

# Lancer l'application Flask
python3 app.py
```

L'application sera accessible sur `http://127.0.0.1:5000`.

---

## 🗄️ Migration des Données & Upload d'Assets

### 1. Migration des Données Utilisateur (SQLite vers Neon)
Si vous disposez d'un fichier SQLite local legacy `pcem1_roadmap.db`, migrez vos logs d'étude et notes vers Neon PostgreSQL en une commande :

```bash
python scripts/migrate_sqlite_to_neon.py
```

### 2. Upload Bulk des Fichiers vers Cloudflare R2
Pour transférer automatiquement le dossier local `source/` (comprenant les 453 fichiers PDF/MP4) vers votre bucket Cloudflare R2 sans subir la limite des 100 fichiers du tableau de bord web :

```bash
python scripts/upload_to_r2.py
```

### 3. Alignement des URLs CDN en Base de Données
Pour mettre à jour tous les chemins relatifs en base de données PostgreSQL afin qu'ils pointent vers votre domaine Cloudflare R2 :

```bash
python scripts/update_r2_urls.py
```

---

## 🚀 Déploiement en Production (Render)

L'application est préconfigurée pour un déploiement continu sur **Render.com** :

1. Créez un nouveau **Web Service** sur [Render](https://render.com/) et connectez votre dépôt GitHub.
2. Définissez les paramètres de build suivants :
   - **Environment :** `Python 3`
   - **Build Command :** `pip install -r requirements.txt`
   - **Start Command :** `gunicorn --workers 2 --threads 4 --timeout 120 app:app`
3. Ajoutez les variables d'environnement suivantes dans le tableau de bord Render :
   - `DATABASE_URL` = *(Votre URL PostgreSQL Neon Pooled avec `-pooler`)*
   - `GEMINI_API_KEY` = *(Votre clé API Google AI Studio)*
   - `R2_PUBLIC_URL` = *(Votre URL publique Cloudflare R2)*
   - `PYTHON_VERSION` = `3.12.2`

---

## ⚡ Optimisations de Performance & Sécurité

- ⚡ **Neon PgBouncer Connection Pooler :** Réduit la latence des requêtes SQL de ~250ms à <10ms en maintenant les connexions SSL/TLS chaudes.
- ⚡ **Mises à jour Optimistes de l'UI :** Les clics sur les boutons de maîtrise dans le Workbench mettent à jour le DOM instantanément (<10ms) pendant que la requête réseau s'exécute de façon asynchrone en arrière-plan.
- 🔒 **Garde-Fou Crawler en Cloud :** `services/organizer.py` détecte automatiquement les environnements cloud (`RENDER=true`) et contourne le scan de disque local afin d'éviter la suppression involontaire de la base de données distante.
- 🔒 **Décodage & Redirection Sécurisée :** `app.py` intègre un middleware d'unquoting d'URLs (`unquote()`) pour intercepter et rediriger de manière fluide les flux multimédias vers le CDN Cloudflare R2.

---

## 👤 Auteur & Licence

- **Auteur :** Mouhamed Gharsallah ([@Med-Gh-TN](https://github.com/Med-Gh-TN))
- **Établissement :** Faculté de Médecine de Tunis (FMT)
- **Licence :** Distribué sous la licence [MIT](LICENSE).

<div align="center">
  <br/>
  <sub>Projet développé avec passion pour réussir le concours du PCEM1. 🇹🇳🩺</sub>
</div>
```
