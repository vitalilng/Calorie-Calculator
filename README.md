# Calorie Calculator - Refactored

This is a refactored version of the Calorie Calculator using Preact and Vite.

## 🚀 Quick Start

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/vitalilng/Calorie-Calculator.git
   cd Calorie-Calculator
   git checkout refactor/code-quality
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set environment variables** (create `.env.local`):
   ```bash
   cp .env.example .env.local
   ```
   Then edit `.env.local` with your Supabase credentials:
   ```
   VITE_SUPABASE_URL=https://your-supabase-url.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```
   Opens http://localhost:3000

### Production Build

```bash
npm run build       # Build to dist/
npm run preview     # Preview production build locally
```

### Deploy to GitHub Pages

**Option 1: Automatic (Recommended)**
- Merge to `main` branch → GitHub Actions auto-deploys
- See `.github/workflows/deploy.yml`

**Option 2: Manual**
```bash
npm install -g gh-pages
npm run deploy
```

**Live URL:**
```
https://vitalilng.github.io/Calorie-Calculator/
```

## 📂 Project Structure

```
src/
├── components/          # Preact components
│   ├── App.jsx         # Main app component
│   ├── AuthScreen.jsx  # Authentication
│   ├── ApiKeyScreen.jsx
│   ├── Header.jsx
│   ├── TodayPage.jsx
│   ├── HistoryPage.jsx
│   ├── AnalysisModal.jsx
│   └── EntryCard.jsx
├── services/           # Business logic
│   ├── supabase.js    # Database services
│   └── nutrition.js   # AI/nutrition API
├── utils/
│   └── helpers.js     # Utility functions
├── styles/
│   └── index.css      # Global styles
├── config.js          # Configuration
└── main.jsx           # Entry point
```

## ✨ Features

- ✅ User authentication (Supabase)
- ✅ AI-powered nutrition estimation (Anthropic Claude)
- ✅ Daily calorie tracking
- ✅ Macro tracking (protein, fat, carbs, fiber)
- ✅ History of past entries
- ✅ Daily nutrition analysis
- ✅ Configurable daily goal
- ✅ Responsive mobile-first design
- ✅ Works on GitHub Pages

## 🔧 Technologies

- **Preact** - Lightweight React alternative (3KB)
- **Vite** - Lightning-fast build tool
- **Supabase** - Backend & authentication
- **Anthropic Claude** - AI nutrition estimation

## 🔐 Security Notes

⚠️ **TODO:** Move API calls to a backend endpoint to protect the Anthropic API key from browser exposure.

Create a serverless function (e.g., Vercel, Supabase Edge Functions) to:
- Accept nutrition estimation requests
- Call Anthropic API server-side
- Return results to client

This prevents exposing your API key in browser code.

### Environment Variables

- `.env.local` - **Never commit** - local credentials only
- `.env.example` - Safe to commit - shows required variables
- GitHub Secrets - For CI/CD if needed

## ⚡ Performance Improvements Made

- ✅ Code split into logical modules
- ✅ Debounced input events
- ✅ Retry logic with exponential backoff
- ✅ Helper functions for calculations
- ✅ Component-based architecture
- ✅ Removed duplicate code
- ✅ Configuration constants
- ✅ Tree-shakeable imports
- ✅ Minified production build

## 📋 Next Steps

1. ✅ Refactor to Preact + Vite
2. ✅ Deploy to GitHub Pages
3. ⏳ Implement backend endpoint for nutrition estimation
4. ⏳ Add offline support with service worker
5. ⏳ Add more accessibility features
6. ⏳ Implement skeleton loaders
7. ⏳ Add unit tests

## 🤝 Contributing

1. Create a feature branch: `git checkout -b feature/name`
2. Make changes and test locally: `npm run dev`
3. Create a pull request
4. After merge to `main`, GitHub Actions will auto-deploy

## 📝 License

MIT
