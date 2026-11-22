# JIKKO Pilotage

Centre de pilotage JIKKO en application web installable : scaling Meta, tests A/B, actions, mails Klaviyo et rentabilité.
Les données sont stockées dans un Google Sheet, l'app est hébergée sur GitHub Pages et s'ouvre en plein écran sur iPhone.

## Comment ça marche

- **Le Google Sheet** est la base de données : un onglet par type de données (`scales`, `abtests`, `actions`, `mails`, `sales`, `adspend`…), une ligne par élément.
- **Le script Google** (`apps-script/Code.gs`), collé dans le Sheet, sert d'API à l'app, protégée par un code secret. Il synchronise aussi Shopify et Klaviyo chaque nuit à 5 h (heure de Los Angeles).
- **L'app** (`index.html`) lit et écrit dans le Sheet à travers ce script. Aucune donnée ni clé n'est dans ce dépôt.

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

### 3. Ajouter les clés (Paramètres du projet → Propriétés du script)
| Propriété | Valeur |
|---|---|
| `SHOPIFY_STORE` | déjà rempli : `fqfk1v-jb.myshopify.com` |
| `SHOPIFY_CLIENT_ID` et `SHOPIFY_CLIENT_SECRET` | Voir « Créer l'app Shopify » ci-dessous |
| `KLAVIYO_KEY` | Klaviyo → Paramètres → Clés API → Créer une clé privée → **lecture seule** sur Campagnes et Métriques |

### Créer l'app Shopify (Dev Dashboard)
Depuis janvier 2026, Shopify ne crée plus d'apps avec un jeton fixe dans l'admin. On passe par le Dev Dashboard, et le script demande lui-même un jeton valable 24 h.
1. Va sur **dev.shopify.com** avec le compte propriétaire de la boutique → **Apps → Créer une app** → nom : « JIKKO Pilotage ».
2. Dans la version de l'app, mets les accès (scopes) **`read_orders`, `read_products`, `read_inventory`**, puis **publie la version** (Release).
3. **Installe l'app** sur la boutique JIKKO (bouton Installer / Install app).
4. Dans **Paramètres** de l'app, copie le **Client ID** et le **Client secret** dans les propriétés du script.

### 4. Ouvrir l'app
1. Va sur l'adresse GitHub Pages du dépôt.
2. Colle l'URL du script et le code secret → **Se connecter**.
3. Sur iPhone : **Safari → Partager → Sur l'écran d'accueil**. L'app s'ouvre en plein écran avec l'icône JIKKO.

## Mettre à jour le script
Après une modification de `Code.gs` : **Déployer → Gérer les déploiements → crayon → Version : Nouvelle version → Déployer**. L'URL ne change pas.

## Notes
- Les ventes Shopify sont calculées à partir des commandes : de petits écarts avec les rapports Shopify Analytics sont possibles (remboursements, fuseau horaire).
- Le COGS est lu dans Shopify (coût par article) dès qu'il est renseigné.
- Intelligems n'a pas de synchro automatique dans l'app autonome : relie un test avec le champ « Test Intelligems » de sa fiche.
- `build/build.py` reconstruit `index.html` à partir de la page de l'outil ; `build/mock_server.py` sert l'app en local avec un faux script pour les tests.
