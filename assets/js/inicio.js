window.addEventListener("DOMContentLoaded", () => {
  const user =
    typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;

  if (!user) {
    window.location.href = "../index.html";
    return;
  }

  const heroNome = document.getElementById("inicioHeroNome");
  if (heroNome) {
    const base = user.nome || user.email || "Usuário";
    heroNome.textContent = base.split(" ")[0];
  }

  const heroGreeting = document.getElementById("inicioHeroGreeting");
  if (heroGreeting) {
    const hora = new Date().getHours();
    let saudacao = "Olá";
    if (hora >= 5 && hora < 12) saudacao = "Bom dia";
    else if (hora >= 12 && hora < 18) saudacao = "Boa tarde";
    else saudacao = "Boa noite";
    heroGreeting.textContent = saudacao;
  }

  const heroKicker = document.getElementById("inicioHeroKicker");
  if (heroKicker) {
    heroKicker.textContent = "sistema online";
  }

  function atualizarHora() {
    const horaEl = document.getElementById("inicioHoraAtual");
    const dataEl = document.getElementById("inicioDataAtual");
    const agora = new Date();

    if (horaEl) {
      const hh = String(agora.getHours()).padStart(2, "0");
      const mm = String(agora.getMinutes()).padStart(2, "0");
      horaEl.textContent = `${hh}:${mm}`;
    }

    if (dataEl) {
      const dia = String(agora.getDate()).padStart(2, "0");
      const mes = String(agora.getMonth() + 1).padStart(2, "0");
      const ano = agora.getFullYear();
      dataEl.textContent = `${dia}/${mes}/${ano}`;
    }
  }

  atualizarHora();
  setInterval(atualizarHora, 30000);

  try {
    const key = "visya-inicio-toast-" + new Date().toISOString().slice(0, 10);
    if (!localStorage.getItem(key)) {
      mostrarToastInicio(
        "Bem-vindo(a) ao VISYA. Use os atalhos para entrar nos módulos."
      );
      localStorage.setItem(key, "1");
    }
  } catch (e) {}
});

function mostrarToastInicio(mensagem) {
  const toast = document.getElementById("toastInicio");
  const span = document.getElementById("toastInicioMsg");
  if (!toast || !span) return;
  span.textContent = mensagem;
  toast.classList.add("toast-ano-visible");
  toast.setAttribute("aria-hidden", "false");
  setTimeout(() => {
    toast.classList.remove("toast-ano-visible");
    toast.setAttribute("aria-hidden", "true");
  }, 2600);
}