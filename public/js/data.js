/* Data module: registry and keys */
(function () {
  const LABORERS_KEY = "lp_laborers";
  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function ensureLaborerRegistry() {
    if (!readJson(LABORERS_KEY, null)) writeJson(LABORERS_KEY, {});
  }
  function getLaborerRegistry() {
    ensureLaborerRegistry();
    return readJson(LABORERS_KEY, {});
  }
  function setLaborerRegistry(registry) {
    writeJson(LABORERS_KEY, registry || {});
  }
  window.LPData = {
    LABORERS_KEY,
    getLaborerRegistry,
    setLaborerRegistry
  };
})();


