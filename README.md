# 🎲 Multi-Game Board Hub Engine (React Native)

<p align="center">
  <img src="https://github.com/user-attachments/assets/bb15227b-01ab-4952-a4d4-89bfa9e1a836" alt="App Screenshot 1" width="250" />
  <img src="https://github.com/user-attachments/assets/3cc25c7d-c9bf-43d8-82ee-15ff8fbe49c4" alt="App Screenshot 2" width="250" />
  <img src="https://github.com/user-attachments/assets/d5c458f6-b5dd-45b8-aaa3-f77c7d8b1d81" alt="App Screenshot 3" width="250" />
</p>

### 🎥 Watch the Demo

[![Watch the video](https://github.com/user-attachments/assets/915c4d90-4e3d-4f24-b73b-2011dd6cf5da)](https://youtu.be/jrHXkQyy2dk)

> **Note:** Click the image above to watch the full gameplay and performance demonstration on YouTube.

---

**Notice:** This repository is a curated showcase of the core engine and architectural decisions behind a commercial, production-ready board game application. Due to intellectual property protection, it contains selected files demonstrating network layer handling, performance optimizations, and React Native lifecycle management, rather than the complete source code.

## 🚀 The Project

A scalable, high-performance Hub built to power multiple turn-based tile board games (starting with Makruk / Thai Chess, expanding to Checkers and regional variants).

**Key Features Implemented:**

- **Real-time Multiplayer Matchmaking:** Powered by Firebase Realtime Database with ultra-low latency specifically optimized for the Southeast Asian market.
- **Robust Disconnect Handling:** Full system for handling rage-quits, temporary network drops, and graceful timeouts.
- **App Store & Play Store Compliant:** Meets all stringent requirements for both Apple and Google ecosystems.
- **Production-Ready Features:** Functional ELO rating system, historical game replays, and full i18n support.

---

## 🛠️ Key Technical Wins & Solved Challenges

Building a 60 FPS board game in React Native for low-end ("potato") devices required aggressive optimization:

- **Render Tree Flattening:** Systematically removed deeply nested `<View>` components to drastically reduce the UI thread load.
- **Overdraw Elimination:** Removed underlying background layers (using `transparent` where applicable) to prevent the GPU from calculating invisible pixels.
- **Asset Memory Pre-loading:** Replaced standard Image components with `expo-image`. Implemented a caching strategy in the root `_layout` to preload heavy piece assets into memory, eliminating rendering bottlenecks when transitioning to the `ActiveGameScreen`.
- **Automated Cloud Garbage Collection:** Wrote custom Firebase Cloud Functions to clean up "zombie" RTDB rooms that accumulated after extreme edge-case disconnects.

---

## 🏗️ Architecture & Known Technical Debt

As an engineer, I believe in full transparency regarding the system's current state. This project was built with a priority on delivering a robust MVP, which naturally introduced some technical debt that is queued for refactoring:

- **State Management Migration (The Zustand Need):** Currently, the app relies heavily on direct Firebase listeners. This leads to redundant RTDB connections across different components. **Roadmap:** Migrate the global game session state to `Zustand` to enforce a Single Source of Truth and reduce network overhead.
- **Incomplete Hub Architecture:** The transition from a single-game app (Makruk) to a multi-game Hub is ongoing. Some game-specific types and constants still leak into generic UI components.
- **UI & Theming Hardcodes:** The theming engine is partially implemented. Several screens still use hardcoded styles that need to be extracted into the central theme provider.
- **Lifecycle Bugs:** A known edge-case exists where an unanswered "Rematch" popup keeps the Firebase listener alive indefinitely until a Cloud Function force-kills the room, throwing a client-side error.
- **Multi-Region Scaling:** With the upcoming addition of European Checkers, the architecture needs to be upgraded to support dynamic Firebase RTDB instances (EU vs. SEA servers) based on the selected game domain.

---

## 📂 Highlighted Code (Where to look)

1. `src/services/multiplayer.service.ts` - Shows the abstraction layer for handling RTDB, abstracting WebSocket complexity away from the UI.
2. `src/games/makruk/board/Square.tsx` - Demonstrates performance optimization using `React.memo` with a custom deep-comparator to prevent 63 squares from re-rendering on a single piece move.
3. `src/features/game-session/hooks/useGameSync.ts` - A complex hook managing the game lifecycle. _(Note: Currently an anti-pattern with too many arguments – queued for Parameter Object refactoring)._

## Oryginal Repo Tree

```text
.
├── app
│   ├── about
│   │   ├── index.tsx
│   │   ├── \_layout.tsx
│   │   ├── licenses.tsx
│   │   └── me.tsx
│   ├── analysis
│   │   └── [id].tsx
│   ├── (auth)
│   │   ├── \_layout.tsx
│   │   └── login.tsx
│   ├── bug
│   │   └── index.tsx
│   ├── game
│   │   └── [id].tsx
│   ├── index.tsx
│   ├── \_layout.tsx
│   ├── profile
│   │   ├── index.tsx
│   │   └── \_leyout.tsx
│   └── (tabs)
│   ├── game.tsx
│   ├── \_layout.tsx
│   ├── learn.tsx
│   ├── options.tsx
│   ├── shop.tsx
│   └── social.tsx
├── app.json
├── babel.config.js
├── drzewo_projektu.txt
├── eas.json
├── expo-env.d.ts
├── fairy-stockfish
├── firebase.json
├── functions
│   ├── lib
│   │   ├── index.js
│   │   └── index.js.map
│   ├── package.json
│   ├── package-lock.json
│   ├── src
│   │   └── index.ts
│   ├── tsconfig.dev.json
│   └── tsconfig.json
├── GoogleService-Info.plist
├── google-services.json
├── metro.config.js
├── nativewind-env.d.ts
├── package.json
├── package-lock.json
├── projekt_tree.txt
├── README.md
├── src
│   ├── core
│   │   ├── constants
│   │   │   └── game.ts
│   │   ├── context
│   │   │   └── AuthContext.tsx
│   │   ├── hooks
│   │   │   └── useLowEndOptimization.ts
│   │   ├── i18n
│   │   │   ├── en.json
│   │   │   ├── i18n.ts
│   │   │   ├── pl.json
│   │   │   └── th.json
│   │   ├── types
│   │   │   └── auth.ts
│   │   └── utils
│   │   └── elo.utils.ts
│   ├── features
│   │   ├── ad-banner
│   │   │   └── AdBanner.tsx
│   │   ├── auth
│   │   │   ├── hooks
│   │   │   │   ├── useAuth.ts
│   │   │   │   └── useUserProfile.ts
│   │   │   └── screen
│   │   │   └── LoginScreenScreen.tsx
│   │   ├── connect
│   │   │   ├── hooks
│   │   │   ├── screen
│   │   │   │   └── SocialScreen.tsx
│   │   │   └── ui
│   │   │   ├── MyClubs.tsx
│   │   │   ├── MyConversations.tsx
│   │   │   └── SocialActions.tsx
│   │   ├── game-session
│   │   │   ├── constants
│   │   │   │   └── constants.ts
│   │   │   ├── hooks
│   │   │   │   ├── useConnectionMonitor.ts
│   │   │   │   ├── useGameSync.ts
│   │   │   │   ├── useGameTimer.ts
│   │   │   │   ├── useHelperManager.ts
│   │   │   │   └── useRoomSync.ts
│   │   │   ├── overlays
│   │   │   │   ├── EmoticonPicker.tsx
│   │   │   │   ├── GameActionsPopup.tsx
│   │   │   │   ├── GameOverModal.tsx
│   │   │   │   └── RematchOverlay.tsx
│   │   │   └── screens
│   │   │   ├── ActiveGameScreen.tsx
│   │   │   └── GameAnalysisScreen.tsx
│   │   ├── learn
│   │   │   ├── hooks
│   │   │   │   └── useGameHistory.ts
│   │   │   ├── screen
│   │   │   │   └── LearnScreen.tsx
│   │   │   └── ui
│   │   │   ├── EloChart.tsx
│   │   │   ├── GameHistory.tsx
│   │   │   └── PlayerProfile.tsx
│   │   ├── more
│   │   │   ├── about
│   │   │   │   └── screen
│   │   │   │   ├── AboutAppScreen.tsx
│   │   │   │   ├── AboutMeScreen.tsx
│   │   │   │   └── OpenSourceLicensesScreen.tsx
│   │   │   ├── bug-report
│   │   │   │   └── BugReportScreen.tsx
│   │   │   ├── hooks
│   │   │   │   └── useOptionsHelpers.ts
│   │   │   ├── screen
│   │   │   │   └── OptionsScreen.tsx
│   │   │   └── ui
│   │   │   ├── OptionsMenu.tsx
│   │   │   ├── ProfileOption.tsx
│   │   │   └── ThemeOption.tsx
│   │   ├── play
│   │   │   ├── hooks
│   │   │   │   ├── useLobby.ts
│   │   │   │   └── useMatchmaking.ts
│   │   │   ├── screens
│   │   │   │   └── GameScreen.tsx
│   │   │   └── ui
│   │   │   ├── LobbyContent.tsx
│   │   │   ├── LobbyTile.tsx
│   │   │   ├── MatchmakingContent.tsx
│   │   │   ├── MatchmakingTile.tsx
│   │   │   ├── PlayVsAiContent.tsx
│   │   │   ├── PlayVsAiTile.tsx
│   │   │   └── WhatsNewContent.tsx
│   │   ├── profile
│   │   │   ├── hooks
│   │   │   │   ├── useChangeNickname.ts
│   │   │   │   └── useLinkYourEmail.ts
│   │   │   └── screen
│   │   │   └── Profile.tsx
│   │   └── shop
│   │   ├── hooks
│   │   ├── screen
│   │   │   └── ShopScreen.tsx
│   │   └── ui
│   │   ├── CommunityStatement.tsx
│   │   ├── PhilanthropistTier.tsx
│   │   ├── PremiumTier.tsx
│   │   └── ThemesSection.tsx
│   ├── games
│   │   ├── checkers
│   │   └── makruk
│   │   ├── assets
│   │   │   ├── piece-assets.ts
│   │   │   └── pieces
│   │   │   ├── black
│   │   │   │   ├── biangai.png
│   │   │   │   ├── bia.png
│   │   │   │   ├── khon.png
│   │   │   │   ├── khun.png
│   │   │   │   ├── ma.png
│   │   │   │   ├── met.png
│   │   │   │   └── rua.png
│   │   │   └── white
│   │   │   ├── biangai.png
│   │   │   ├── bia.png
│   │   │   ├── khon.png
│   │   │   ├── khun.png
│   │   │   ├── ma.png
│   │   │   ├── met.png
│   │   │   └── rua.png
│   │   ├── board
│   │   │   ├── Board.tsx
│   │   │   ├── PlayerInfo.tsx
│   │   │   └── Square.tsx
│   │   ├── logic
│   │   │   ├── board.logic.ts
│   │   │   ├── makruk.constants.ts
│   │   │   ├── makruk.types.ts
│   │   │   ├── notation.ts
│   │   │   ├── rules.logic.ts
│   │   │   └── useGameLogic.ts
│   │   └── types
│   │   └── chess.types.ts
│   ├── services
│   │   ├── firebase.service.ts
│   │   ├── firebase.ts
│   │   ├── multiplayer.service.ts
│   │   └── README.md
│   ├── shared
│   │   └── assets
│   │   ├── images
│   │   │   ├── icons
│   │   │   │   ├── background.webp
│   │   │   │   ├── gmail.png
│   │   │   │   ├── instagram.png
│   │   │   │   ├── linkedin.png
│   │   │   │   ├── logIn-bg-256.webp
│   │   │   │   ├── logIn-bg.webp
│   │   │   │   ├── Makruk-1024-32.png
│   │   │   │   └── splash-screen-32.png
│   │   │   ├── log-in
│   │   │   │   ├── apple-black-logo.png
│   │   │   │   ├── apple-icon-white.png
│   │   │   │   ├── google-1x.png
│   │   │   │   └── icon-line_1.png
│   │   │   ├── navigation
│   │   │   │   └── droplet.png
│   │   │   └── personal
│   │   │   └── personal.jpeg
│   │   └── README.md
│   └── theme
│   ├── board.theme.ts
│   ├── default.ts
│   └── index.tsx
├── tailwind.config.js
└── tsconfig.json

75 directories, 151 files
```
