<div align="center">
  
# 🎓 ATLAS — Aggregated Tunisian Learning & Academic System

<p align="center">
  <b>Universal Academic Workstation, Multi-Program Curriculum Roadmap & AI Tutor</b>
</p>

[![Live Production](https://img.shields.io/badge/Production-Live_App-0284c7?style=for-the-badge&logo=render&logoColor=white)](https://pcem1-roadmap.onrender.com)
[![Python Version](https://img.shields.io/badge/Python-3.12.2-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.1.3-000000?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon.tech-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech/)
[![Cloudflare R2](https://img.shields.io/badge/CDN-Cloudflare_R2-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://www.cloudflare.com/developer-platform/r2/)
[![Google Gemini](https://img.shields.io/badge/AI-Google_Gemini-8E7CC3?style=for-the-badge&logo=google-gemini&logoColor=white)](https://ai.google.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

<br/>

<a href="https://pcem1-roadmap.onrender.com"><strong>🚀 Accéder au Portail Live ATLAS »</strong></a>

<br/>

</div>

---

## 📖 Vue d'Ensemble (Overview)

**ATLAS** (*Aggregated Tunisian Learning & Academic System*) est une plate-forme web universelle haute performance conçue pour centraliser, indexer et tutorer de façon dynamique les filières et programmes académiques en Tunisie (**Filières Médicales PCEM1, Licences Informatiques LSI, Baccalauréats Scientifique & Économique, etc.**).

À partir d'une simple arborescence de fichiers dans le répertoire `source/Original/`, ATLAS exécute un pipeline autonome de transmutation, de compression adapative et d'indexation taxonomique pour offrir aux étudiants un espace de travail interactif scindé, alimenté par l'IA Google Gemini et un réseau CDN à latence nulle.

### 🌟 Points Forts & Fonctionnalités Clés
- 🎓 **Moteur Multiprogramme Dynamique (Program Selector) :** Basculez instantanément d'une filière à une autre (`PCEM1`, `LSI2`, `Bac Science`) via un sélecteur dynamique.
- 📅 **Navigation Périodique Adaptative :** Détection automatique des périodes académiques (Trimestres 1/2/3 pour le lycée, Semestres 1/2 pour l'université, ou Modules de spécialité).
- ⚙️ **Pipeline Différentiel `Original ➔ Processed` :** Traitement automatique des fichiers sources. Transmutation Office vers PDF (LibreOffice) et compression adaptative des PDFs numérisés (jusqu'à -80% d'espace économisé) avec vérification mathématique d'intégrité anti-page noire.
- 🔍 **Moteur SOTA Hybride OCRmyPDF / PyMuPDF :** Injection automatique de calques de texte OCR sur les scans d'examens et correction d'orientation (`--deskew`) pour rendre les documents consultables par l'IA.
- 📖 **Espace de Travail Scindé (Split-Screen Workbench) :** Visionnez les supports de cours (PDF/MP4) directement via Cloudflare R2 tout en prenant des notes synchronisées.
- 🤖 **Tuteur IA Vocale & Textuelle (Gemini Live) :** Interaction vocale bidirectionnelle en temps réel via WebSockets (`flask-sock`), adaptée aux notes et au programme actif de l'étudiant.
- ✨ **Génération de Fiches & QCMs Interactifs :** Création de résumés HTML et de QCMs de révision alimentée par Gemini et protégée par un Circuit Breaker résilient.
- 🔥 **Gamification & Analytics :** Calcul de progression pondérée, heatmap d'étude style GitHub, et timer Pomodoro.

---

## 🏗️ Architecture Système (3-Tier Zero-Cost Stack)

```mermaid
flowchart TD
    subgraph Client ["Client Navigateur (Vanilla ES6 Modules)"]
        UI["Interface Dashboard & Dynamic Roadmap"]
        SEL["Program & Period Selector (main.js)"]
        WB["Espace de Travail Scindé (workbench.js)"]
        QP["Moteur de Quiz QCM (qcm_player.js)"]
        TUTO_UI["Tuteur IA Vocale/Textuelle (tuto.js)"]
    end

    subgraph Storage ["Staging Pipeline & CDN"]
        ORIG["source/Original/ (Fichiers Bruts)"]
        PROC["source/Processed/ (PDFs Optimisés & OCR)"]
        R2["Cloudflare R2 Bucket (CDN $0 Egress)"]
    end

    subgraph AppServer ["App Server (Flask + Python 3.12)"]
        APP["app.py / Thread Reloader Non-Bloquant"]
        C_ROADMAP["roadmap_routes.py (/api/programs, /api/roadmap)"]
        C_GAMIFY["gamification_routes.py"]
        C_AI["ai_routes.py"]
        C_TUTO["tuto_routes.py (WebSockets)"]
        
        S_ORG["services/organizer.py (Differential Pipeline & PDF Engine)"]
        S_AI["services/ai_agent.py (Multi-Program RAG)"]
        S_CONV["services/converter_service.py"]
        S_MASTERY["services/mastery_engine.py"]
    end

    subgraph DataTier ["Database (Neon PostgreSQL)"]
        PG[("Neon PostgreSQL Pooled\n(resources, study_logs, theme_notes,\ncourse_summaries, qcm_history)")]
    end

    subgraph External ["Services IA Externes"]
        GEMINI["Google Gemini Studio API\n(Gemini 2.5 Flash / Gemma / Live WS)"]
    end

    ORIG -->|Transmutation & Compression| PROC
    PROC -->|Delta Sync Upload| R2

    UI -->|HTTP GET /api/roadmap?program=...| C_ROADMAP
    WB -->|Direct Stream| R2
    WB -->|HTTP POST /api/progress| C_ROADMAP
    QP -->|HTTP POST /api/qcm/submit| C_GAMIFY
    
    C_TUTO <-->|WebSocket /ws/tuto| TUTO_UI
    C_TUTO <-->|Stream Audio/Texte| GEMINI

    C_AI -->|SSE /api/ai/summarize, /quiz| S_AI
    S_AI -->|Extraction RAG PDF Contextuelle| S_AI
    S_AI -->|Requêtes LLM| GEMINI

    C_ROADMAP -->|SQL Queries| PG
    C_GAMIFY -->|SQL Queries| PG

    S_ORG -->|Indexation Automatique| PG
    C_GAMIFY -->|Évaluation Mathématique| S_MASTERY
```

---

## 📁 Structure du Projet

```text
ATLAS/
├── app.py                      # Application Flask, WSGI Factory & Thread de crawl non-bloquant
├── run.py                      # Orchestrateur local autoreparateur (venv, pip, discovery de ports)
├── requirements.txt            # Dependency Lock (Versions strictes de production)
├── .python-version             # Locking runtime Python (3.12.2)
├── .exemple.env                # Modèle des variables d'environnement
├── .gitignore                  # Exclusion des clés, venv, DB locales et fichiers médias
├── controllers/                # Contrôleurs HTTP & WebSockets (Flask Blueprints)
│   ├── ai_routes.py            # Endpoints SSE streaming (Quiz, Explain, Summarize)
│   ├── gamification_routes.py  # Endpoints pour streaks, heatmap, logs d'étude et notes
│   ├── roadmap_routes.py       # Endpoints /api/programs, /api/roadmap, search & export
│   └── tuto_routes.py          # Contrôleur WebSocket pour Assistant Vocal Gemini Live
├── repository/                 # Couche d'Accès aux Données (DAL)
│   ├── db.py                   # Connecteur PostgreSQL Neon & Schemas Multiprogrammes
│   ├── roadmap_repo.py         # Mappings SQL pour resources & filtres par programme
│   └── user_data_repo.py       # Mappings SQL pour logs d'étude, notes et QCMs
├── services/                   # Couche Métier (Domain Services)
│   ├── ai_agent.py             # Moteur RAG PyMuPDF, parseur TOON et Circuit Breaker Gemini
│   ├── converter_service.py    # Service de conversion Office/PDF (LibreOffice/Fitz)
│   ├── mastery_engine.py       # Algorithme mathématique d'évaluation de la maîtrise
│   └── organizer.py            # Pipeline Différentiel, OCRmyPDF & Compression Adatative
├── scripts/                    # Scripts d'Infrastructure et de Maintenance
│   ├── upload_to_r2.py         # Differential Delta Sync Uploader Boto3 vers Cloudflare R2
│   ├── update_r2_urls.py       # Aligne de manière idempotente les URLs CDN en Base de Données
│   └── reset_db.py             # Script CLI de réinitialisation complète de la base Neon
├── source/                     # Staging Directory pour les Filières Académiques
│   ├── Original/               # Fichiers bruts déposés par l'utilisateur (ex: PCEM1, LSI2)
│   └── Processed/              # PDFs optimisés, transmutés et indexés prêts pour R2
├── static/                     # Assets Statiques Frontend
│   ├── css/
│   │   └── style.css           # Tokens de design Apple HIG, Glassmorphic UI & Heatmap CSS
│   └── js/
│       ├── api.js              # Client HTTP Asynchrone & Moteur Streaming SSE
│       ├── main.js             # Moteur de rendu principal & orchestrateur DOM
│       ├── core/
│       │   └── state.js        # Gestionnaire d'état centralisé (currentProgram, activeTree)
│       └── features/
│           ├── gamification.js # Timers Pomodoro & calculs Heatmap
│           ├── qcm_player.js   # Rendu interactif des QCMs
│           ├── roadmap.js      # Vues Grille, Chronologie & Filtres par Programme
│           ├── tuto.js         # Capture audio PCM 16kHz & Tuteur Vocal
│           └── workbench.js    # Lecteur scindé & mises à jour optimistes (<10ms)
└── templates/                  # Templates HTML Jinja2
    ├── index.html              # Vue Single-Page Application (SPA) ATLAS
    ├── components/
    │   ├── header.html         # Barre de navigation ATLAS & Widget Pomodoro
    │   ├── modals.html         # Modales génériques & Modale IA
    │   └── workbench.html      # Modal Espace de Travail scindé
    └── layout/
        └── base.html           # Layout HTML5 de base
```

---

## 🛠️ Configuration des Manifests de Filières (`manifest.json`)

Chaque sous-dossier de filière dans `source/Original/<Nom_Filiere>/` peut optionnellement contenir un fichier `manifest.json` définissant la structure, les coefficients et les sessions d'examen :

```json
{
  "program": "Bac Science 2026",
  "default_semester": "Trimestre 1",
  "exam_sessions": [
    {
      "id": "session_bac",
      "name": "Examen National du Baccalauréat",
      "target_date": "2026-06-08T08:00:00Z"
    }
  ],
  "curriculum": {
    "Mathématiques": {
      "coeff": 4,
      "hours": 5,
      "aliases": ["math", "maths"],
      "subjects": {"Analyse": 3, "Géométrie": 2}
    }
  }
}
```

*Note : Si aucun `manifest.json` n'est présent, ATLAS applique un mode **Zero-Config** en déduisant automatiquement la taxonomie à partir des répertoires (`<Filière>/<Niveau>/<Module>/<Section>/<Fichier>`).*

---

## 🛠️ Variables d'Environnement

Créez un fichier `.env` à la racine du projet :

| Variable | Requis | Description | Exemple |
|---|---|---|---|
| `GEMINI_API_KEY` | **Oui** | Clé API Google AI Studio | `AIzaSy...` |
| `GEMINI_MODELS` | **Oui** | Chaîne de repli du Circuit Breaker | `gemini-2.5-flash,gemini-2.5-pro,gemma-4-31b-it` |
| `DATABASE_URL` | **Oui** | Chaîne PostgreSQL Neon Pooled (`-pooler`) | `postgresql://user:pass@ep-name-pooler.region.aws.neon.tech/neondb?sslmode=require` |
| `R2_PUBLIC_URL` | **Oui** | Domaine public CDN Cloudflare R2 | `https://pub-xxxxxx.r2.dev` |
| `R2_ACCOUNT_ID` | Non* | ID de compte Cloudflare (Uploader) | `ee06704270b5c49d3...` |
| `R2_ACCESS_KEY_ID` | Non* | Clé d'accès S3 API Cloudflare | `f5f8541223c6ec0...` |
| `R2_SECRET_ACCESS_KEY` | Non* | Clé secrète S3 API Cloudflare | `77c0839e6e816286...` |
| `R2_BUCKET_NAME` | Non* | Nom du bucket R2 | `pcem1-assets` |
| `PORT` | Non | Port d'écoute du serveur web | `5000` |

*\* Requis uniquement pour l'exécution du script `scripts/upload_to_r2.py`.*

---

## 💻 Configuration & Lancement Local

### 1. Cloner le Dépôt
```bash
git clone https://github.com/Med-Gh-TN/pcem1-roadmap.git
cd pcem1-roadmap
```

### 2. Lancement Automatisé (Recommandé)
Le script `run.py` configure automatiquement l'environnement virtuel `.venv`, valide les dépendances et lance le serveur avec auto-recompilation :

```bash
python3 run.py
```

### 3. Exécution Manuelle du Pipeline de Crawl
Pour traiter vos dossiers déposés dans `source/Original/` et reconcilier la base Neon :

```bash
# Lancer le crawler dynamique & la compression PDF
python3 services/organizer.py
```

---

## 🗄️ Differential Sync & Deploy CDN Cloudflare R2

### 1. Synchronisation Différentielle vers Cloudflare R2
Transférez vos fichiers traités depuis `source/Processed/` vers votre bucket Cloudflare R2 avec saut automatique des fichiers déjà présents :

```bash
# Transférer tout le catalogue Processed
python3 scripts/upload_to_r2.py

# Ou cibler uniquement une filière spécifique
python3 scripts/upload_to_r2.py LSI2
```

### 2. Alignement des URLs CDN en Base de Données
Convertissez de façon idempotente les chemins locaux de la base PostgreSQL vers votre domaine Cloudflare R2 :

```bash
python3 scripts/update_r2_urls.py
```

### 3. Réinitialisation Complète de la Base (Clean Slate)
Pour supprimer et recréer les tables PostgreSQL à neuf :

```bash
python3 scripts/reset_db.py --force
```

---

## ⚡ Dependency Versions

Toutes les dépendances de production sont rigoureusement verrouillées dans `requirements.txt` :

```text
Flask==3.1.3
google-genai==2.14.0
Jinja2==3.1.6
python-dotenv==1.1.1
PyMuPDF==1.27.2.3
flask-sock==0.7.0
psycopg2-binary==2.9.9
gunicorn==21.2.0
boto3==1.28.57
```

---

## 🚀 Déploiement en Production (Render)

1. Créez un **Web Service** sur [Render](https://render.com/) et reliez votre dépôt GitHub.
2. Définissez les paramètres :
   - **Environment :** `Python 3`
   - **Build Command :** `pip install -r requirements.txt`
   - **Start Command :** `gunicorn --workers 2 --threads 4 --timeout 120 app:app`
3. Renseignez vos variables d'environnement (`DATABASE_URL`, `GEMINI_API_KEY`, `R2_PUBLIC_URL`, `PYTHON_VERSION=3.12.2`).

---

## 👤 Auteur & Licence

- **Auteur :** Mouhamed Gharsallah ([@Med-Gh-TN](https://github.com/Med-Gh-TN))
- **Établissement :** Faculté de Médecine de Tunis (FMT) / ATLAS Platform
- **Licence :** Distribué sous la licence [MIT](LICENSE).

<div align="center">
  <br/>
  <sub>Développé avec passion pour démocratiser et optimiser l'apprentissage académique en Tunisie. 🇹🇳🎓</sub>
</div>
