// loader.js
// Loads each source file in order, compiles JSX with Babel, and executes.
// External file avoids inline-script restrictions on some hosting setups.
(function () {
  const showBootError = (msg) => {
    const el = document.getElementById('boot-error');
    if (!el) return;
    el.style.display = 'block';
    el.textContent = msg;
  };

  if (location.protocol === 'file:') {
    showBootError('This app must be served from a local server (not file://). Run: python3 -m http.server 5173 --directory .');
    return;
  }

  const getBasePath = () => {
    const path = location.pathname;
    const last = path.split('/').pop() || '';
    if (last.includes('.')) {
      return path.replace(/[^/]*$/, '');
    }
    return path.endsWith('/') ? path : `${path}/`;
  };

  const base = getBasePath();

  const files = [
    'src/ui/icons.js',
    'src/utils/ingest.js',
    'src/utils/nodeUtils.js',
    'src/ui/SimpleChart.js',
    'src/components/PropertiesPanel.js',
    'src/components/TreeNode.js',
    'src/app/AnalysisApp.js',
    'src/main.jsx'
  ];

  const loadAll = async () => {
    if (!window.Babel) {
      showBootError('Babel failed to load. Check CDN access.');
      return;
    }

    for (const file of files) {
      const res = await fetch(`${base}${file}`);
      if (!res.ok) {
        showBootError(`Failed to load ${file}. Status ${res.status}. Base path: ${base}`);
        return;
      }
      const code = await res.text();
      try {
        const compiled = Babel.transform(code, { presets: ['react'] }).code;
        (0, eval)(compiled);
      } catch (err) {
        console.error(err);
        showBootError(`Error while compiling ${file}: ${err?.message || err}`);
        return;
      }
    }
  };

  loadAll().catch((err) => {
    console.error(err);
    showBootError(`Loader failed: ${err?.message || err}`);
  });
})();
