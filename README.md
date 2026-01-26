This is a cool prototype I'm working on.

Built by Joan Sterjo

## Deploying to GitHub Pages

1. Push to `main` (or `master`). The included GitHub Actions workflow will build and publish.
2. In GitHub → Settings → Pages:
   - Source: GitHub Actions
   - Select the workflow "Deploy to GitHub Pages" if prompted.
3. Your site URL will be `https://<username>.github.io/<repo>/`.

Notes:
- `.nojekyll` is included to avoid Jekyll processing.
- The workflow builds the app and publishes `dist/`.



## Local Preview
Install dependencies and run the dev server:

```bash
npm install
npm run dev
```
