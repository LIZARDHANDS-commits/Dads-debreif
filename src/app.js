// Entry point. For now it only shows the build version; the shell arrives in
// tasks/app-frame/todo.md, tasks 4 and 5.
const version = document.querySelector('meta[name="app-version"]')?.content ?? 'dev';
const slot = document.getElementById('app-version');
if (slot) slot.textContent = version;
