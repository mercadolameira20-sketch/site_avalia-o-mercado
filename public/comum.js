const NOMES = { atendimento: "Atendimento", preco: "Preço", ambiente: "Ambiente" };
const CRITERIOS = Object.keys(NOMES);

function cor(p) {
  return p >= 75 ? "#2fbf71" : p >= 50 ? "#f5c400" : p >= 25 ? "#ff8a1f" : "#f0443a";
}
function rotulo(p) {
  return p >= 75 ? "Excelente" : p >= 50 ? "Bom" : p >= 25 ? "Regular" : "Péssimo";
}
function pct(n) {
  return n == null ? "–" : Math.round(n) + "%";
}

async function api(caminho, opcoes = {}) {
  const r = await fetch("/api" + caminho, opcoes);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.erro || "Algo deu errado."), { status: r.status });
  return d;
}

function deviceId() {
  try {
    let id = localStorage.getItem("dev_id");
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : "d" + Math.random().toString(36).slice(2) + Date.now();
      localStorage.setItem("dev_id", id);
    }
    return id;
  } catch {
    return "";
  }
}

function pintarResumo(d, ids) {
  const g = d.geral;
  const anel = document.getElementById(ids.anel);
  anel.style.setProperty("--p", g == null ? 0 : g);
  anel.style.setProperty("--c", g == null ? "#dfe3e8" : cor(g));
  document.getElementById(ids.pct).textContent = pct(g);
  const rot = document.getElementById(ids.rot);
  rot.textContent = g == null ? "Ainda sem avaliações" : rotulo(g);
  rot.style.color = g == null ? "var(--muted)" : cor(g);
  document.getElementById(ids.total).textContent =
    d.total === 0 ? "Seja o primeiro a avaliar" : d.total === 1 ? "1 avaliação" : d.total + " avaliações";
  document.getElementById(ids.tabela).innerHTML = CRITERIOS.map((c) => {
    const m = d.medias[c];
    return `<tr><td class="nome">${NOMES[c]}</td>
      <td class="meio"><div class="termo"><i style="width:${m == null ? 0 : m}%;background:${m == null ? "#dfe3e8" : cor(m)}"></i></div></td>
      <td class="val" style="color:${m == null ? "var(--muted)" : cor(m)}">${pct(m)}</td></tr>`;
  }).join("");
}
