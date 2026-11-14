import { getStore } from "@netlify/blobs";
import { randomUUID, timingSafeEqual } from "node:crypto";

export const config = { path: "/api/*" };

const TZ = "America/Sao_Paulo";
const CRIT = ["atendimento", "preco", "ambiente"];

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const nomeLoja = () => process.env.NOME_LOJA || "Mercado Lameira";
const resp = (d, status = 200, headers = {}) =>
  new Response(JSON.stringify(d), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
const S = (name) => getStore({ name, consistency: "strong" });
const somaVazia = () => ({ atendimento: 0, preco: 0, ambiente: 0 });
const vazio = () => ({ total: 0, soma: somaVazia(), dias: {} });

// intervalo de atualização (minutos): padrão 1 hora, ajustável pelo ADM entre 15 min e 24 h
const INTERVALO_PADRAO = 60, INTERVALO_MIN = 15, INTERVALO_MAX = 1440;
async function lerIntervalo() {
  const c = await S("dados").get("config", { type: "json" });
  const v = Number(c && c.intervaloMin);
  return Number.isInteger(v) && v >= INTERVALO_MIN && v <= INTERVALO_MAX ? v : INTERVALO_PADRAO;
}

function resumir(a) {
  const n = a.total;
  const medias = {};
  for (const c of CRIT) medias[c] = n ? a.soma[c] / n : null;
  const geral = n ? CRIT.reduce((s, c) => s + medias[c], 0) / CRIT.length : null;
  return { total: n, medias, geral };
}

function lerCookie(req, nome) {
  const m = (req.headers.get("cookie") || "").match(new RegExp("(?:^|; )" + nome + "=([^;]+)"));
  return m ? m[1] : null;
}

const idValido = (s) => typeof s === "string" && /^[\w-]{8,64}$/.test(s);

async function jaAvaliou(ids, dia) {
  const travas = S("travas");
  for (const id of ids) {
    if (id && (await travas.get(`${dia}/${id}`))) return true;
  }
  return false;
}

function autorizado(req) {
  const senha = process.env.ADMIN_PASSWORD;
  if (!senha) return "sem-senha";
  const enviada = req.headers.get("x-admin-key") || "";
  const a = Buffer.from(enviada);
  const b = Buffer.from(senha);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async (req) => {
  const url = new URL(req.url);
  const rota = url.pathname.replace(/^\/api/, "") || "/";

  try {
    // ---------- Público: resumo em tempo real ----------
    if (rota === "/resumo" && req.method === "GET") {
      const ag = (await S("dados").get("agregado", { type: "json" })) || vazio();
      const ids = [url.searchParams.get("id"), lerCookie(req, "dev_id")].filter(idValido);
      return resp({
        nome: nomeLoja(),
        ...resumir(ag),
        jaAvaliou: await jaAvaliou(ids, hoje()),
        intervaloMin: await lerIntervalo(),
      });
    }

    // ---------- Público: enviar avaliação ----------
    if (rota === "/avaliar" && req.method === "POST") {
      let b;
      try {
        b = await req.json();
      } catch {
        return resp({ erro: "Requisição inválida." }, 400);
      }
      const notas = {};
      for (const c of CRIT) {
        const v = Number(b[c]);
        if (!Number.isFinite(v) || v < 0 || v > 100) return resp({ erro: "Notas inválidas." }, 400);
        notas[c] = Math.round(v);
      }

      const idCookie = lerCookie(req, "dev_id") || randomUUID();
      const ids = [idValido(b.id) ? b.id : null, idCookie];
      const dia = hoje();
      const setCookie = {
        "set-cookie": `dev_id=${idCookie}; Path=/; Max-Age=31536000; SameSite=Lax; Secure; HttpOnly`,
      };

      if (await jaAvaliou(ids, dia)) {
        return resp({ erro: "Você já avaliou hoje. Volte amanhã para avaliar de novo." }, 409, setCookie);
      }

      // trava primeiro, para evitar envio duplo
      const travas = S("travas");
      for (const id of ids) if (id) await travas.set(`${dia}/${id}`, "1");

      const dados = S("dados");
      const ag = (await dados.get("agregado", { type: "json" })) || vazio();
      ag.total += 1;
      for (const c of CRIT) ag.soma[c] += notas[c];
      const d = ag.dias[dia] || (ag.dias[dia] = { total: 0, soma: somaVazia() });
      d.total += 1;
      for (const c of CRIT) d.soma[c] += notas[c];
      await dados.setJSON("agregado", ag);

      const ts = new Date().toISOString();
      await S("avaliacoes").setJSON(`${Date.now()}-${randomUUID().slice(0, 6)}`, { ts, dia, ...notas });

      return resp({ ok: true, nome: nomeLoja(), ...resumir(ag), jaAvaliou: true }, 200, setCookie);
    }

    // ---------- ADM: detalhes ----------
    if (rota === "/admin/dados" && req.method === "GET") {
      const auth = autorizado(req);
      if (auth === "sem-senha")
        return resp({ erro: "Configure a variável ADMIN_PASSWORD no Netlify e faça um novo deploy." }, 500);
      if (!auth) return resp({ erro: "Senha incorreta." }, 401);

      const ag = (await S("dados").get("agregado", { type: "json" })) || vazio();

      const dias = Object.keys(ag.dias)
        .sort()
        .slice(-14)
        .map((dia) => {
          const x = ag.dias[dia];
          return { dia, ...resumir({ total: x.total, soma: x.soma }) };
        });

      const store = S("avaliacoes");
      const { blobs } = await store.list();
      const chaves = blobs.map((x) => x.key).sort().slice(-100).reverse();
      const ultimas = (await Promise.all(chaves.map((k) => store.get(k, { type: "json" })))).filter(Boolean);

      return resp({ nome: nomeLoja(), ...resumir(ag), dias, ultimas, intervaloMin: await lerIntervalo() });
    }

    // ---------- ADM: ajustar intervalo de atualização ----------
    if (rota === "/admin/config" && req.method === "POST") {
      const auth = autorizado(req);
      if (auth === "sem-senha")
        return resp({ erro: "Configure a variável ADMIN_PASSWORD no Netlify e faça um novo deploy." }, 500);
      if (!auth) return resp({ erro: "Senha incorreta." }, 401);

      let b;
      try {
        b = await req.json();
      } catch {
        return resp({ erro: "Requisição inválida." }, 400);
      }
      const v = Number(b.intervaloMin);
      if (!Number.isInteger(v) || v < INTERVALO_MIN || v > INTERVALO_MAX)
        return resp({ erro: "Escolha um intervalo entre 15 minutos e 24 horas." }, 400);
      await S("dados").setJSON("config", { intervaloMin: v });
      return resp({ ok: true, intervaloMin: v });
    }

    return resp({ erro: "Não encontrado." }, 404);
  } catch (e) {
    console.error(e);
    return resp({ erro: "Erro interno. Tente novamente." }, 500);
  }
};
