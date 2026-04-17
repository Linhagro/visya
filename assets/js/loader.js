// /assets/js/loader.js

// Referências aos overlays existentes na aplicação
// Ajuste os IDs abaixo se no seu HTML eles tiverem outros nomes.
const defaultOverlay = document.getElementById("global-loader-overlay");
const rotasOverlay = document.getElementById("rotas-loader-overlay");

/**
 * Mostra um overlay específico.
 * O CSS do overlay deve ter display: none por padrão.
 */
function internalShow(overlay) {
  if (!overlay) return;
  overlay.style.display = "flex"; // ou "block", dependendo do seu layout
}

/**
 * Esconde um overlay específico.
 */
function internalHide(overlay) {
  if (!overlay) return;
  overlay.style.display = "none";
}

/**
 * Função global para exibir o loader.
 * Prioriza o overlay de rotas, se existir.
 */
window.showLoader = function () {
  if (rotasOverlay) internalShow(rotasOverlay);
  else if (defaultOverlay) internalShow(defaultOverlay);
};

/**
 * Função global para esconder o loader.
 */
window.hideLoader = function () {
  if (rotasOverlay) internalHide(rotasOverlay);
  else if (defaultOverlay) internalHide(defaultOverlay);
};