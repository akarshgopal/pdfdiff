(() => {
  let savedTheme = null;
  try {
    savedTheme = window.localStorage.getItem("pdfdiff-theme");
  } catch {
    // System preference remains available when storage is disabled.
  }
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", savedTheme === "dark" || (!savedTheme && prefersDark));
})();
