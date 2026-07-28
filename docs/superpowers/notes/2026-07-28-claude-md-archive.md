# CLAUDE.md — contenu archivé (2026-07-28)

Contenu historique/daté retiré de `CLAUDE.md` pour réduire la taille du contexte auto-chargé à chaque session. Ce fichier n'est PAS auto-chargé — à consulter seulement si besoin de l'historique détaillé.

---

## Envoi de courriels transactionnels (Resend) — historique complet

**Infrastructure + invitations en place depuis le 2026-07-26.** `app/api/send-email.ts` — route Vercel générique branchée sur **Resend** (gratuit jusqu'à 3000 courriels/mois, 100/jour), protégée par un vrai jeton de session Supabase (même pattern que le handler push de `google-calendar-sync.ts`). Le front appelle `sendEmail()` dans `app/src/data/emailStore.ts` (fire-and-forget, même logique que `pushToGoogleCalendar` dans `eventStore.ts`).

**Fait (2026-07-26) :**
- **Invitations client** (`invitationStore.ts`'s `sendClientInvitationEmail()`, câblé dans `FicheClient.tsx`) — invitation initiale et "Renvoyer" envoient maintenant un vrai courriel, en plus du lien copié dans le presse-papier (toujours disponible en repli).
- **Invitations équipe** (`teamStore.ts`'s `sendTeamInvitationEmail()`, câblé dans `MonEquipe.tsx`) — même chose pour l'invitation initiale.
- Les deux sautent l'envoi en session démo (pas de vrai destinataire).
- **Lacune connue, hors de ce chantier :** le bouton "Renvoyer l'invitation" du panneau détail membre dans `MonEquipe.tsx` n'a toujours aucun `onClick` — stub préexistant, pas encore raccordé (il faut d'abord faire transiter le token de l'invitation en attente dans ce panneau).

**Reste à brancher** (inventaire fait le 2026-07-26, à revérifier avant de continuer — le code peut avoir changé) :

- **Préférences de notification** (`notifPrefsStore.ts`) — le type `ChannelPrefs` a déjà un champ `email` (activé par défaut pour `mention`/`approval`) affiché dans Paramètres, mais **rien ne lit ce champ pour envoyer un vrai courriel** — l'interface promet une fonctionnalité qui n'existe pas encore.
- **Demandes d'approbation** (`RequestApprovalButton.tsx`, `Portail.tsx`) — notifie seulement dans l'app (`addNotif`), jamais par courriel, malgré la préférence ci-dessus.
- **Commentaires et mentions** (`commentNotify.ts`) — pareil, in-app seulement, même pour une mention `@`.
- **Soumission de formulaire public** (`PublicFormFill.tsx` → `formSubmissionsStore.ts`) — **aucune notification du tout**, ni in-app ni courriel ; le studio ne voit une soumission qu'en ouvrant la liste manuellement.
- **Finances/factures** (`financeStore.ts`, `Finances.tsx`) — aucune relance automatique de facture en retard.

*(Ce backlog est aussi suivi dans la mémoire auto — voir `resend-email-integration-deferred.md`.)*

---

## Assistant IA — idée future (fournisseur au choix du studio)

**Idée future (pas commencée) :** laisser chaque studio choisir son propre fournisseur IA — clé API personnelle (ChatGPT/OpenAI ou Anthropic, coût à leur charge) ou un Ollama auto-hébergé pour les studios techniques. Nécessiterait une couche de traduction par fournisseur (chacun a son propre format d'outils/function-calling), en plus de celle qui existe déjà pour Anthropic dans `ai-chat.ts`. Volontairement pas prioritaire tant qu'aucun client ne le demande — un seul fournisseur avec quota est plus simple et moins cher à opérer.

---

## Génération IA StoryboardView — détails d'implémentation

Le modal de génération IA du storyboard (`StoryboardView`, dans `app/src/screens/ResourceDetail.tsx`) supporte trois modes de prompt accessibles depuis un toggle **Texte / Dessin**.

**Mode Texte :**
- Textarea de description libre avec pré-remplissage depuis le label du plan
- Bouton dictée vocale (Web Speech API, icône `mic`/`mic-off`) — état `sbListening` + `sbRecognitionRef`
- Transcription en temps réel ajoutée au prompt

**Mode Dessin (canvas 16:9) :**
- Canvas HTML5 (`canvasRef`, 544×306 px, ratio 16/9) avec fond noir initialisé via `useEffect` sur `[showAIModal, promptMode]`
- Palette de 8 couleurs (points colorés), slider de taille de brosse (1–20 px), bouton Gomme (toggle `isErasing`), bouton Effacer (`clearCanvas`)
- Dessin souris + touch (`startDraw`/`continueDraw`/`endDraw`) via `globalCompositeOperation`: `'source-over'` (pinceau) ou `'destination-out'` (gomme)
- Champ description optionnel sous le canvas
- `generateImage()` capture le canvas via `canvas.toDataURL('image/png')` et préfixe le prompt avec `[Croquis]`

**États et refs :**
```typescript
const [promptMode, setPromptMode]  = useState<'text' | 'draw'>('text');
const [sbListening, setSbListening] = useState(false);
const [drawColor, setDrawColor]    = useState('#ffffff');
const [brushSize, setBrushSize]    = useState(4);
const [isErasing, setIsErasing]    = useState(false);
const canvasRef     = useRef<HTMLCanvasElement>(null);
const isDrawingRef  = useRef(false);
const sbRecognitionRef = useRef<any>(null);
```

`openAI()` remet `promptMode` à `'text'` et `isErasing` à `false` à chaque ouverture. En mode dessin, le bouton Générer est actif même sans texte (le croquis suffit).
