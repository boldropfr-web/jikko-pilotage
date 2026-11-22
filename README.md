# JIKKO Pilotage

Centre de pilotage JIKKO en application web installable : scaling Meta, tests A/B, actions, mails Klaviyo et rentabilité.
Les données sont stockées dans un Google Sheet, l'app est hébergée sur GitHub Pages et s'ouvre en plein écran sur iPhone.

## Comment ça marche

- **Le Google Sheet** est la base de données : un onglet par type de données (`scales`, `abtests`, `actions`, `mails`, `sales`, `adspend`, `meta`…), une ligne par élément.
- **Le script Google** (`apps-script/Code.gs`), collé dans le Sheet, sert d'API à l'app, protégée par un code secret. Il ne se connecte à aucun service extérieur.
- **Claude fait les synchros** Shopify, Klaviyo et Intelligems avec les connecteurs du compte Claude, via une tâche planifiée chaque matin, et écrit dans le Sheet à travers le script. Aucune clé d'API n'est nécessaire.
- **L'app** (`index.html`) lit et écrit dans le Sheet. Les boutons « Synchro » de l'app déposent une demande que Claude traite au passage suivant. Le pied de page indique la date de la dernière synchro.
- Aucune donnée ni code secret n'est dans ce dépôt.

## Installation (une seule fois)

### 1. Coller le script dans le Sheet
1. Ouvre le Google Sheet → **Extensions → Apps Script**.
2. Efface le contenu de `Code.gs` et colle tout le fichier [`apps-script/Code.gs`](apps-script/Code.gs).
3. Enregistre (icône disquette), choisis la fonction **`setup`** dans la liste du haut, puis **Exécuter**. Accepte les autorisations demandées par Google.
4. Ouvre **Journal d'exécution** : il affiche le **code secret de l'app**. Garde-le.

### 2. Publier le script
1. **Déployer → Nouveau déploiement** → type **Application Web**.
2. Exécuter en tant que : **Moi**. Qui a accès : **Tout le monde**.
3. **Déployer**, puis copie l'**URL de l'application Web** (elle finit par `/exec`).

### 3. Donner l'accès à Claude
Envoie l'URL `/exec` et le code secret à Claude : il transfère les données existantes dans le Sheet et programme la synchro du matin.

### 4. Ouvrir l'app
1. Va sur https://boldropfr-web.github.io/jikko-pilotage/
2. Colle l'URL du script et le code secret → **Se connecter**.
3. Sur iPhone : **Safari → Partager → Sur l'écran d'accueil**. L'app s'ouvre en plein écran avec l'icône JIKKO.

## Mettre à jour le script
Après une modification de `Code.gs` : **Déployer → Gérer les déploiements → crayon → Version : Nouvelle version → Déployer**. L'URL ne change pas.

## Notes
- Le COGS vient de Shopify (coût par article) dès qu'il est renseigné.
- `build/build.py` reconstruit `index.html` à partir de la page de l'outil ; `build/mock_server.py` sert l'app en local avec un faux script pour les tests.
