# IH-QMS Staff Web

The staff UI calls **QMS.Api** for login, branches, queue, and SignalR.

## “Failed to fetch” on one laptop but not another

The browser only runs `fetch` / SignalR on **that** machine. **`http://127.0.0.1:5154` is always “this laptop”**, not your Windows API host.

**Recommended (dev): use the Vite proxy** so the browser only talks to the Vite dev server; Node forwards to the API (works even when the browser cannot reach the API IP directly).

In `apps/staff-web/.env.local`:

```env
VITE_DEV_USE_PROXY=true
VITE_DEV_API_PROXY_TARGET=http://<WINDOWS_LAN_IP>:5154
```

Then **restart** `npm run dev`. Open the site at the URL Vite prints (e.g. `http://localhost:5173`). Login calls go to `http://localhost:5173/api/...` and Vite proxies them to Windows.

**Without proxy:** set `VITE_API_URL=http://<WINDOWS_LAN_IP>:5154` and ensure the **browser’s** machine can reach that IP (firewall, `dotnet run --urls "http://0.0.0.0:5154"`).

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
