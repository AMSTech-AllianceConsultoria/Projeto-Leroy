require("dotenv").config();

const express = require("express");
const hana = require("@sap/hana-client");
const https = require("https");
const http = require("http");
const { URL } = require("url");

const app = express();
const port = process.env.APP_PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

const ambientes = {
  qas: {
    nome: "QAS",
    host: process.env.QAS_HANA_HOST,
    port: process.env.QAS_HANA_PORT,
    user: process.env.QAS_HANA_USER,
    password: process.env.QAS_HANA_PASSWORD,
    schema: process.env.QAS_HANA_SCHEMA
  },
  prd: {
    nome: "Produção",
    host: process.env.PRD_HANA_HOST,
    port: process.env.PRD_HANA_PORT,
    user: process.env.PRD_HANA_USER,
    password: process.env.PRD_HANA_PASSWORD,
    schema: process.env.PRD_HANA_SCHEMA
  }
};

const taxoneExecution = {
  enabled: String(process.env.TAXONE_EXECUTION_ENABLED || "false").toLowerCase() === "true",
  portalInterceptorAppId: process.env.TAXONE_PORTAL_INTERCEPTOR_APP_ID || "tax4b.tart.ui",
  timeoutMs: Number(process.env.TAXONE_HTTP_TIMEOUT_MS || 120000),
  // Mantém compatibilidade com o formato antigo, mas prioriza as credenciais por ambiente.
  cookie: process.env.TAXONE_COOKIE || "",
  csrfToken: process.env.TAXONE_CSRF_TOKEN || "",
  autoLoginEnabled: String(process.env.TAXONE_AUTO_LOGIN_ENABLED || "true").toLowerCase() !== "false",
  qas: {
    baseUrl: process.env.QAS_TAXONE_BASE_URL || "",
    cookie: process.env.QAS_TAXONE_COOKIE || "",
    csrfToken: process.env.QAS_TAXONE_CSRF_TOKEN || "",
    user: process.env.QAS_TAXONE_USER || "",
    password: process.env.QAS_TAXONE_PASSWORD || "",
    loginUrl: process.env.QAS_TAXONE_LOGIN_URL || "",
    loginPath: process.env.QAS_TAXONE_LOGIN_PATH || process.env.TAXONE_LOGIN_PATH || "/uaa-security/login.do",
    loginStartUrl: process.env.QAS_TAXONE_LOGIN_START_URL || process.env.TAXONE_LOGIN_START_URL || ""
  },
  prd: {
    baseUrl: process.env.PRD_TAXONE_BASE_URL || "",
    cookie: process.env.PRD_TAXONE_COOKIE || "",
    csrfToken: process.env.PRD_TAXONE_CSRF_TOKEN || "",
    user: process.env.PRD_TAXONE_USER || "",
    password: process.env.PRD_TAXONE_PASSWORD || "",
    loginUrl: process.env.PRD_TAXONE_LOGIN_URL || "",
    loginPath: process.env.PRD_TAXONE_LOGIN_PATH || process.env.TAXONE_LOGIN_PATH || "/uaa-security/login.do",
    loginStartUrl: process.env.PRD_TAXONE_LOGIN_START_URL || process.env.TAXONE_LOGIN_START_URL || ""
  },
  loginMode: String(process.env.TAXONE_LOGIN_MODE || "form").toLowerCase(), // form, json ou basic
  loginUsernameField: process.env.TAXONE_LOGIN_USERNAME_FIELD || "username",
  loginPasswordField: process.env.TAXONE_LOGIN_PASSWORD_FIELD || "password",
  csrfFetchPath: process.env.TAXONE_CSRF_FETCH_PATH || "",
  loginDebug: String(process.env.TAXONE_LOGIN_DEBUG || "false").toLowerCase() === "true"
};

const taxoneSessionCache = {
  qas: { cookie: "", csrfToken: "", updatedAt: null },
  prd: { cookie: "", csrfToken: "", updatedAt: null }
};

const taxoneFilterStrict = String(process.env.TAXONE_FILTER_STRICT || "true").toLowerCase() !== "false";

console.log("TaxOne cookie QAS no .env:", taxoneExecution.qas.cookie ? "CONFIGURADO" : "VAZIO");
console.log("TaxOne cookie PRD no .env:", taxoneExecution.prd.cookie ? "CONFIGURADO" : "VAZIO");

function respostaRelatorios(rows) {
  return rows.map(row => ({
    grupo_id: row.GRUPO_ID,
    id: row.ID,
    nome: row.NOME,
    fonte_id: row.FONTE_ID,
    mandt: row.MANDT,
    empresa: row.EMPRESA,
    orgstr: row.ORGSTR,
    tipo: row.TIPO,
    tipo_exportacao: row.TIPO_EXPORTACAO,
    dt_inicial_cadastro: row.DT_INICIAL,
    dt_final_cadastro: row.DT_FINAL,
    cv_fonte: row.CV_FONTE
  }));
}

function respostaFiltroTaxOneVazio(res, motivo, detalhe) {
  // Mantém compatibilidade com o frontend: retorna array vazio, não objeto de erro.
  // Assim nunca volta a exibir o cadastro bruto do HANA quando o filtro TaxOne falha.
  res.setHeader("X-TaxOne-Filter", "strict-empty");
  res.setHeader("X-TaxOne-Filter-Motivo", encodeURIComponent(String(motivo || "Filtro TaxOne não aplicado")));
  if (detalhe) {
    res.setHeader("X-TaxOne-Filter-Detalhe", encodeURIComponent(String(detalhe).slice(0, 500)));
  }
  return res.json([]);
}

function getAmbiente(env) {
  const ambiente = ambientes[String(env || "").toLowerCase()];
  if (!ambiente) throw new Error("Ambiente inválido. Use qas ou prd.");

  if (!ambiente.host || !ambiente.port || !ambiente.user || !ambiente.password || !ambiente.schema) {
    throw new Error(`Ambiente ${ambiente.nome} incompleto no arquivo .env.`);
  }

  return ambiente;
}

function runQuery(ambiente, sql, params = []) {
  return new Promise((resolve, reject) => {
    const connection = hana.createConnection();

    const config = {
      serverNode: `${ambiente.host}:${ambiente.port}`,
      uid: ambiente.user,
      pwd: ambiente.password,
      encrypt: "false",
      sslValidateCertificate: "false",
      currentSchema: ambiente.schema
    };

    connection.connect(config, (err) => {
      if (err) {
        return reject(new Error(
          `Erro ao conectar no HANA ${ambiente.nome} em ${ambiente.host}:${ambiente.port}: ${err.message}`
        ));
      }

      connection.exec(sql, params, (err, rows) => {
        connection.disconnect();

        if (err) return reject(new Error("Erro ao executar query: " + err.message));

        resolve(rows);
      });
    });
  });
}

function ultimoDiaDoMes(ano, mes) {
  return new Date(Number(ano), Number(mes), 0).getDate();
}

function yyyymmdd(ano, mes, dia) {
  return String(ano) + String(mes).padStart(2, "0") + String(dia).padStart(2, "0");
}

function obterMesAno(req) {
  return {
    mes: req.body?.mes || req.query?.mes,
    ano: req.body?.ano || req.query?.ano
  };
}

function validarPeriodo(mes, ano) {
  if (!mes || !ano) {
    throw new Error("Informe mês e ano. Exemplo: ?mes=5&ano=2026 ou body JSON {\"mes\":5,\"ano\":2026}.");
  }

  const mesNum = Number(mes);
  const anoNum = Number(ano);

  if (mesNum < 1 || mesNum > 12 || anoNum < 2000 || anoNum > 2100) {
    throw new Error("Mês ou ano inválido.");
  }

  return {
    mes: mesNum,
    ano: anoNum,
    periodo: String(mesNum).padStart(2, "0"),
    dt_inicial: yyyymmdd(anoNum, mesNum, 1),
    dt_final: yyyymmdd(anoNum, mesNum, ultimoDiaDoMes(anoNum, mesNum))
  };
}


function obterPeriodoComFallback(req) {
  const direto = obterMesAno(req);
  const mes = direto.mes || process.env.TAXONE_DEFAULT_MES || new Date().getMonth() + 1;
  const ano = direto.ano || process.env.TAXONE_DEFAULT_ANO || new Date().getFullYear();
  return validarPeriodo(mes, ano);
}

function extrairListaTaxOne(statusTaxOne) {
  if (Array.isArray(statusTaxOne)) return statusTaxOne;
  if (!statusTaxOne || typeof statusTaxOne !== "object") return [];

  const chavesProvaveis = ["relatorios", "data", "results", "items", "resultado", "rows", "Relatorios", "RELATORIOS"];
  for (const chave of chavesProvaveis) {
    if (Array.isArray(statusTaxOne[chave])) return statusTaxOne[chave];
  }

  // Fallback: procura recursivamente o primeiro array de objetos que pareça lista de relatórios.
  const visitados = new Set();
  function procurar(obj) {
    if (!obj || typeof obj !== "object" || visitados.has(obj)) return [];
    visitados.add(obj);

    if (Array.isArray(obj)) {
      const pareceRelatorio = obj.some(item => item && typeof item === "object" && (
        item.ID !== undefined || item.id !== undefined ||
        item.NOME !== undefined || item.nome !== undefined ||
        item.RELATORIO_ID !== undefined || item.relatorio_id !== undefined
      ));
      if (pareceRelatorio) return obj;

      for (const item of obj) {
        const achado = procurar(item);
        if (achado.length) return achado;
      }
      return [];
    }

    for (const valor of Object.values(obj)) {
      const achado = procurar(valor);
      if (achado.length) return achado;
    }
    return [];
  }

  return procurar(statusTaxOne);
}

function normalizarTexto(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function getTaxOneBaseUrl(env) {
  const key = String(env || "").toLowerCase();
  const cfg = taxoneExecution[key];

  if (!taxoneExecution.enabled) {
    throw new Error("Execução real não configurada. Defina TAXONE_EXECUTION_ENABLED=true no .env.");
  }

  if (!cfg || !cfg.baseUrl) {
    throw new Error(`Base URL do TaxOne não configurada para ${key}. Defina ${key.toUpperCase()}_TAXONE_BASE_URL no .env.`);
  }

  return String(cfg.baseUrl).replace(/\/+$/, "");
}

function getTaxOneAuthConfig(env) {
  const key = String(env || "").toLowerCase();
  const cfg = taxoneExecution[key] || {};
  const cache = taxoneSessionCache[key] || {};

  // PRIORIDADE CORRETA:
  // 1. Cookie fixo do ambiente (.env), copiado do navegador.
  // 2. Cookie global TAXONE_COOKIE, se usado.
  // 3. Cookie em cache gerado por tentativa de login automático.
  //
  // Motivo: no XSA/OIDC deste ambiente, o login automático consegue autenticar no UAA,
  // mas não materializa o cookie AR-* do App Router. Portanto, quando houver cookie
  // no .env, ele deve sempre ser usado primeiro.
  return {
    cookie: cfg.cookie || taxoneExecution.cookie || cache.cookie || "",
    csrfToken: cfg.csrfToken || taxoneExecution.csrfToken || cache.csrfToken || ""
  };
}

function getAuthHeaders(env, reqHeaders = {}) {
  const auth = getTaxOneAuthConfig(env);
  const cookie = reqHeaders.cookie || reqHeaders.Cookie || auth.cookie || "";
  const csrfToken = reqHeaders["x-csrf-token"] || reqHeaders["X-CSRF-Token"] || auth.csrfToken || "";

  if (!cookie) {
    const key = String(env || "").toUpperCase();
    throw new Error(
      `Cookie de sessão do TaxOne não disponível. Configure ${key}_TAXONE_USER/${key}_TAXONE_PASSWORD e ${key}_TAXONE_LOGIN_URL para login automático, ou use ${key}_TAXONE_COOKIE como fallback temporário.`
    );
  }

  const headers = {
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Content-Type": "application/json; charset=UTF-8",
    "Cookie": cookie,
    "X-Requested-With": "XMLHttpRequest"
  };

  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  return headers;
}

function montarCookieAPartirSetCookie(setCookieHeaders) {
  if (!setCookieHeaders) return "";
  const lista = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return lista
    .map(item => String(item).split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

function mesclarCookies(cookieAtual, novoCookie) {
  const mapa = new Map();
  for (const parte of String(cookieAtual || "").split(";")) {
    const item = parte.trim();
    if (!item || !item.includes("=")) continue;
    mapa.set(item.split("=")[0], item);
  }
  for (const parte of String(novoCookie || "").split(";")) {
    const item = parte.trim();
    if (!item || !item.includes("=")) continue;
    mapa.set(item.split("=")[0], item);
  }
  return Array.from(mapa.values()).join("; ");
}

function montarTaxOneLoginUrl(env) {
  const key = String(env || "").toLowerCase();
  const cfg = taxoneExecution[key] || {};
  if (cfg.loginUrl) return cfg.loginUrl;
  const baseUrl = getTaxOneBaseUrl(env);
  return `${baseUrl}${String(cfg.loginPath || "/uaa-security/login.do").startsWith("/") ? "" : "/"}${cfg.loginPath || "/uaa-security/login.do"}`;
}

function montarTaxOneLoginStartUrl(env) {
  const key = String(env || "").toLowerCase();
  const cfg = taxoneExecution[key] || {};
  if (cfg.loginStartUrl) return cfg.loginStartUrl;

  // Importante: iniciar o fluxo pelo recurso protegido que o Node realmente consome.
  // Em XSA/OIDC, iniciar por /sites pode autenticar o portal, mas não necessariamente
  // materializa a sessão aceita pelo app tax4b-tart-js. Por isso usamos o endpoint
  // /tax4b-tart-js/relatorio como URL inicial de autenticação.
  const baseUrl = getTaxOneBaseUrl(env);
  const appId = encodeURIComponent(taxoneExecution.portalInterceptorAppId);
  const mandt = process.env.TAXONE_AUTH_TEST_MANDT || "200";
  const ano = process.env.TAXONE_AUTH_TEST_ANO || process.env.TAXONE_DEFAULT_ANO || new Date().getFullYear();
  const periodo = String(process.env.TAXONE_AUTH_TEST_PERIODO || process.env.TAXONE_DEFAULT_MES || (new Date().getMonth() + 1)).padStart(2, "0");
  const grupo = process.env.TAXONE_AUTH_TEST_GRUPO || "7";
  return `${baseUrl}/tax4b-tart-js/relatorio/${encodeURIComponent(mandt)}/${encodeURIComponent(ano)}/${encodeURIComponent(periodo)}/${encodeURIComponent(grupo)}?portalInterceptorAppId=${appId}`;
}

function extrairFormAction(html) {
  const texto = String(html || "");
  const formMatch = texto.match(/<form\b[^>]*>/i);
  if (!formMatch) return "";
  const actionMatch = formMatch[0].match(/action\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return actionMatch ? (actionMatch[2] || actionMatch[3] || actionMatch[4] || "") : "";
}

async function carregarPaginaLoginTaxOne(env, maxRedirects = 12) {
  let urlAtual = montarTaxOneLoginStartUrl(env);
  let cookie = "";
  let ultimaResposta = null;

  for (let i = 0; i < maxRedirects; i++) {
    const resp = await callTaxOneHttpDetailed(urlAtual, {
      method: "GET",
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
        ...(cookie ? { "Cookie": cookie } : {})
      },
      okStatuses: [301, 302, 303, 307, 308]
    });

    ultimaResposta = resp;
    debugLogin(env, "GET_LOGIN_PAGE", urlAtual, resp);
    const novoCookie = montarCookieAPartirSetCookie(resp.headers["set-cookie"]);
    if (novoCookie) cookie = mesclarCookies(cookie, novoCookie);

    const bodyTexto = typeof resp.body === "string" ? resp.body : "";
    const pareceLogin = resp.statusCode === 200 && (
      /\/login(\?|$)/i.test(new URL(urlAtual).pathname) ||
      /name=["']?password["']?/i.test(bodyTexto) ||
      /type=["']password["']/i.test(bodyTexto)
    );

    if (pareceLogin) {
      const action = extrairFormAction(bodyTexto);
      return {
        loginUrl: action ? resolverUrlAbsoluta(urlAtual, action) : urlAtual,
        cookie,
        hiddenInputs: extrairHiddenInputs(bodyTexto),
        ultimaResposta: resp
      };
    }

    const location = resp.headers.location;
    if (!location || ![301, 302, 303, 307, 308].includes(resp.statusCode)) {
      return {
        loginUrl: montarTaxOneLoginUrl(env),
        cookie,
        hiddenInputs: extrairHiddenInputs(bodyTexto),
        ultimaResposta: resp
      };
    }

    urlAtual = resolverUrlAbsoluta(urlAtual, location);
  }

  return { loginUrl: montarTaxOneLoginUrl(env), cookie, hiddenInputs: {}, ultimaResposta };
}

function callTaxOneHttpDetailed(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === "https:";
    const lib = isHttps ? https : http;

    const requestOptions = {
      method: options.method || "GET",
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      headers: options.headers || {},
      timeout: taxoneExecution.timeoutMs,
      rejectUnauthorized: false
    };

    const req = lib.request(requestOptions, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { raw += chunk; });
      response.on("end", () => {
        const contentType = response.headers["content-type"] || "";
        let body = raw;
        if (String(contentType).includes("application/json") && raw) {
          try { body = JSON.parse(raw); } catch (_) { body = raw; }
        }

        const okStatuses = options.okStatuses || [];
        const statusOk = (response.statusCode >= 200 && response.statusCode < 300) || okStatuses.includes(response.statusCode);
        if (!statusOk) {
          const resumo = typeof body === "string" ? body.slice(0, 2000) : JSON.stringify(body).slice(0, 2000);
          return reject(new Error(
            `TaxOne HTTP ${response.statusCode} ${response.statusMessage || ""}. URL=${url}. Retorno=${resumo}`
          ));
        }

        resolve({ statusCode: response.statusCode, headers: response.headers, body });
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error(`Timeout conectando no TaxOne após ${taxoneExecution.timeoutMs}ms. URL=${url}`));
    });

    req.on("error", (err) => {
      reject(new Error(`Falha HTTP/TLS conectando no TaxOne. URL=${url}. Causa=${err.code || ""} ${err.message}`));
    });

    if (options.body) req.write(options.body);
    req.end();
  });
}

function extrairHiddenInputs(html) {
  const campos = {};
  const texto = String(html || "");
  const inputRegex = /<input\b[^>]*>/gi;
  const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;

  for (const match of texto.matchAll(inputRegex)) {
    const tag = match[0];
    const attrs = {};
    for (const attr of tag.matchAll(attrRegex)) {
      attrs[String(attr[1]).toLowerCase()] = attr[3] ?? attr[4] ?? attr[5] ?? "";
    }
    const name = attrs.name || attrs.id;
    if (name && campos[name] === undefined) campos[name] = attrs.value || "";
  }
  return campos;
}



async function carregarFormularioLoginDiretoTaxOne(env, loginUrl, cookieInicial = "") {
  const resp = await callTaxOneHttpDetailed(loginUrl, {
    method: "GET",
    headers: {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
      ...(cookieInicial ? { "Cookie": cookieInicial } : {})
    },
    okStatuses: [301, 302, 303, 307, 308]
  });

  debugLogin(env, "GET_LOGIN_FORM", loginUrl, resp);

  let cookie = cookieInicial || "";
  const novoCookie = montarCookieAPartirSetCookie(resp.headers["set-cookie"]);
  if (novoCookie) cookie = mesclarCookies(cookie, novoCookie);

  const bodyTexto = typeof resp.body === "string" ? resp.body : "";
  const action = extrairFormAction(bodyTexto);
  const hiddenInputs = extrairHiddenInputs(bodyTexto);

  if (taxoneExecution.loginDebug) {
    const nomes = Object.keys(hiddenInputs).join(", ") || "nenhum";
    console.log(`[TaxOne Login Debug][${String(env).toUpperCase()}][GET_LOGIN_FORM] hidden-fields=${nomes}`);
    const temPassword = /type=["']password["']/i.test(bodyTexto) || /name=["']?password["']?/i.test(bodyTexto);
    console.log(`[TaxOne Login Debug][${String(env).toUpperCase()}][GET_LOGIN_FORM] password-field-detected=${temPassword}`);
  }

  return {
    loginUrl: action ? resolverUrlAbsoluta(loginUrl, action) : loginUrl,
    cookie,
    hiddenInputs,
    resp
  };
}

function resolverUrlAbsoluta(base, location) {
  if (!location) return "";
  return new URL(location, base).toString();
}

function nomesCookies(setCookieHeaders) {
  if (!setCookieHeaders) return "";
  const lista = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return lista.map(item => String(item).split("=")[0]).join(", ");
}

function debugLogin(env, etapa, url, resp) {
  if (!taxoneExecution.loginDebug) return;
  const loc = resp?.headers?.location || "";
  const sc = nomesCookies(resp?.headers?.["set-cookie"]);
  console.log(`[TaxOne Login Debug][${String(env).toUpperCase()}][${etapa}] status=${resp?.statusCode} url=${url}`);
  if (sc) console.log(`[TaxOne Login Debug][${String(env).toUpperCase()}][${etapa}] set-cookie=${sc}`);
  if (loc) console.log(`[TaxOne Login Debug][${String(env).toUpperCase()}][${etapa}] location=${loc}`);
}

async function seguirRedirectsSessao(urlInicial, cookieInicial = "", maxRedirects = 20) {
  let urlAtual = urlInicial;
  let cookie = cookieInicial || "";
  let ultimaResposta = null;

  for (let i = 0; i < maxRedirects; i++) {
    const resp = await callTaxOneHttpDetailed(urlAtual, {
      method: "GET",
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
        ...(cookie ? { "Cookie": cookie } : {})
      },
      okStatuses: [302, 303, 304]
    });

    ultimaResposta = resp;
    debugLogin("redirect", "FOLLOW", urlAtual, resp);
    const novoCookie = montarCookieAPartirSetCookie(resp.headers["set-cookie"]);
    if (novoCookie) cookie = mesclarCookies(cookie, novoCookie);

    const location = resp.headers.location;
    if (!location || ![301, 302, 303, 307, 308].includes(resp.statusCode)) {
      return { cookie, ultimaResposta: resp, urlFinal: urlAtual };
    }

    urlAtual = resolverUrlAbsoluta(urlAtual, location);
  }

  return { cookie, ultimaResposta, urlFinal: urlAtual };
}

async function renovarSessaoTaxOne(env) {
  const key = String(env || "").toLowerCase();
  const keyUpper = key.toUpperCase();
  const cfg = taxoneExecution[key] || {};

  if (!taxoneExecution.autoLoginEnabled) {
    throw new Error("Login automático do TaxOne desabilitado. Defina TAXONE_AUTO_LOGIN_ENABLED=true.");
  }
  if (!cfg.user || !cfg.password) {
    throw new Error(`Credenciais de login automático ausentes. Defina ${keyUpper}_TAXONE_USER e ${keyUpper}_TAXONE_PASSWORD no .env.`);
  }

  let loginUrl = montarTaxOneLoginUrl(env);
  const mode = taxoneExecution.loginMode;
  let cookieSessao = "";
  let hiddenInputs = {};

  // Em XSA/OIDC, iniciar diretamente em /uaa-security-oidc/login autentica no UAA,
  // mas não cria a sessão final do App Router TaxOne. Por isso começamos pelo /sites
  // protegido e seguimos os redirects até a tela de login.
  if (mode === "form") {
    try {
      const loginPage = await carregarPaginaLoginTaxOne(env);
      loginUrl = loginPage.loginUrl || loginUrl;
      cookieSessao = mesclarCookies(cookieSessao, loginPage.cookie || "");
      hiddenInputs = loginPage.hiddenInputs || {};

      // Em alguns ambientes o endpoint protegido retorna 200/Unauthorized em vez de redirecionar
      // para a tela de login. Nesse caso precisamos abrir a LOGIN_URL diretamente antes do POST,
      // para capturar JSESSIONID temporário e campos hidden/CSRF exigidos pelo UAA/OIDC.
      const loginUrlConfigurada = montarTaxOneLoginUrl(env);
      const semHidden = !hiddenInputs || Object.keys(hiddenInputs).length === 0;
      const loginDireto = loginUrl === loginUrlConfigurada || semHidden;
      if (loginDireto) {
        const formLogin = await carregarFormularioLoginDiretoTaxOne(env, loginUrlConfigurada, cookieSessao);
        loginUrl = formLogin.loginUrl || loginUrlConfigurada;
        cookieSessao = mesclarCookies(cookieSessao, formLogin.cookie || "");
        hiddenInputs = { ...(hiddenInputs || {}), ...(formLogin.hiddenInputs || {}) };
      }
    } catch (err) {
      console.warn(`Não foi possível iniciar o fluxo protegido do TaxOne em ${keyUpper}:`, err.message);
    }
  }

  let headers = { "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8" };
  let body = "";
  let method = "POST";

  if (mode === "basic") {
    method = "GET";
    headers["Authorization"] = `Basic ${Buffer.from(`${cfg.user}:${cfg.password}`).toString("base64")}`;
  } else if (mode === "json") {
    headers["Content-Type"] = "application/json; charset=UTF-8";
    body = JSON.stringify({
      [taxoneExecution.loginUsernameField]: cfg.user,
      [taxoneExecution.loginPasswordField]: cfg.password
    });
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    const camposPost = {
      ...hiddenInputs,
      [taxoneExecution.loginUsernameField]: cfg.user,
      [taxoneExecution.loginPasswordField]: cfg.password
    };
    if (taxoneExecution.loginDebug) {
      console.log(`[TaxOne Login Debug][${keyUpper}][POST_LOGIN] form-fields=${Object.keys(camposPost).join(", ")}`);
    }
    const form = new URLSearchParams(camposPost);
    body = form.toString();
  }

  try {
    const loginParsed = new URL(loginUrl);
    headers["Origin"] = `${loginParsed.protocol}//${loginParsed.host}`;
    headers["Referer"] = loginUrl;
  } catch (_) {}

  if (cookieSessao) headers["Cookie"] = cookieSessao;

  const loginResponse = await callTaxOneHttpDetailed(loginUrl, {
    method,
    headers,
    body,
    okStatuses: [302, 303]
  });

  debugLogin(env, "POST_LOGIN", loginUrl, loginResponse);
  const cookieLogin = montarCookieAPartirSetCookie(loginResponse.headers["set-cookie"]);
  if (cookieLogin) cookieSessao = mesclarCookies(cookieSessao, cookieLogin);

  const location = loginResponse.headers.location;
  if (location) {
    const redirectUrl = resolverUrlAbsoluta(loginUrl, location);
    const redir = await seguirRedirectsSessao(redirectUrl, cookieSessao).catch(err => {
      console.warn(`Login em ${keyUpper} retornou redirect, mas o follow automático falhou:`, err.message);
      return { cookie: cookieSessao };
    });
    if (redir.cookie) cookieSessao = mesclarCookies(cookieSessao, redir.cookie);
  }

  // Após autenticar no UAA/OIDC, acessa novamente o app protegido para forçar
  // emissão dos cookies finais do App Router: AR-* e JSESSIONID_* do TaxOne.
  try {
    const startUrl = montarTaxOneLoginStartUrl(env);
    const redirApp = await seguirRedirectsSessao(startUrl, cookieSessao, 12);
    if (redirApp.cookie) cookieSessao = mesclarCookies(cookieSessao, redirApp.cookie);
  } catch (err) {
    console.warn(`Login em ${keyUpper} concluído, mas não foi possível materializar sessão do App Router:`, err.message);
  }

  if (!cookieSessao) {
    throw new Error(
      `Login automático não retornou cookie. Verifique ${keyUpper}_TAXONE_LOGIN_URL, TAXONE_LOGIN_MODE e os campos de usuário/senha.`
    );
  }

  if (!/\bAR-[^=]+=/.test(cookieSessao)) {
    console.warn(`Atenção: sessão renovada para ${keyUpper}, mas cookie AR-* não foi capturado. O endpoint tax4b-tart-js pode continuar retornando 401.`);
  }

  taxoneSessionCache[key].cookie = mesclarCookies(taxoneSessionCache[key].cookie, cookieSessao);
  taxoneSessionCache[key].updatedAt = new Date().toISOString();

  if (taxoneExecution.csrfFetchPath) {
    try {
      const baseUrl = getTaxOneBaseUrl(env);
      const csrfUrl = `${baseUrl}${taxoneExecution.csrfFetchPath.startsWith("/") ? "" : "/"}${taxoneExecution.csrfFetchPath}`;
      const csrfResp = await callTaxOneHttpDetailed(csrfUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "Cookie": taxoneSessionCache[key].cookie,
          "X-CSRF-Token": "Fetch",
          "X-Requested-With": "XMLHttpRequest"
        },
        okStatuses: [304]
      });
      const novoCookie = montarCookieAPartirSetCookie(csrfResp.headers["set-cookie"]);
      if (novoCookie) taxoneSessionCache[key].cookie = mesclarCookies(taxoneSessionCache[key].cookie, novoCookie);
      if (csrfResp.headers["x-csrf-token"]) taxoneSessionCache[key].csrfToken = csrfResp.headers["x-csrf-token"];
    } catch (err) {
      console.warn(`Sessão renovada para ${keyUpper}, mas não foi possível buscar CSRF automaticamente:`, err.message);
    }
  }

  console.log(`Sessão TaxOne renovada automaticamente para ${keyUpper} em ${taxoneSessionCache[key].updatedAt}.`);
  return taxoneSessionCache[key];
}

async function getAuthHeadersAuto(env, reqHeaders = {}) {
  try {
    return getAuthHeaders(env, reqHeaders);
  } catch (err) {
    if (!String(err.message).includes("Cookie de sessão")) throw err;
    await renovarSessaoTaxOne(env);
    return getAuthHeaders(env, reqHeaders);
  }
}

async function callTaxOneHttpWithAutoLogin(env, url, options = {}) {
  try {
    return await callTaxOneHttp(url, options);
  } catch (err) {
    const msg = String(err.message || "");
    if (!msg.includes("TaxOne HTTP 401")) throw err;

    const key = String(env || "").toLowerCase();
    const cfg = taxoneExecution[key] || {};

    // Se existe cookie fixo no .env e mesmo assim houve 401, não tente substituir por
    // login automático, pois o fluxo OIDC deste ambiente não gera o AR-* necessário.
    // Nesse caso, o correto é renovar o cookie no navegador e atualizar o .env.
    if (cfg.cookie || taxoneExecution.cookie) {
      throw new Error(
        `${err.message}. Cookie configurado no .env foi usado, mas foi recusado pelo TaxOne. ` +
        `Renove ${key.toUpperCase()}_TAXONE_COOKIE copiando novamente os cookies AR-* e JSESSIONID_* do navegador.`
      );
    }

    console.warn(`Sessão TaxOne expirada para ${key.toUpperCase()}. Renovando automaticamente e repetindo a chamada...`);
    taxoneSessionCache[key] = { cookie: "", csrfToken: "", updatedAt: null };
    await renovarSessaoTaxOne(env);
    const headers = getAuthHeaders(env, {});

    return callTaxOneHttp(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        "Cookie": headers.Cookie,
        ...(headers["X-CSRF-Token"] ? { "X-CSRF-Token": headers["X-CSRF-Token"] } : {})
      }
    });
  }
}

function callTaxOneHttp(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === "https:";
    const lib = isHttps ? https : http;

    const requestOptions = {
      method: options.method || "GET",
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      headers: options.headers || {},
      timeout: taxoneExecution.timeoutMs,
      rejectUnauthorized: false
    };

    const req = lib.request(requestOptions, (response) => {
      let raw = "";

      response.setEncoding("utf8");

      response.on("data", chunk => {
        raw += chunk;
      });

      response.on("end", () => {
        const contentType = response.headers["content-type"] || "";

        let body = raw;
        if (String(contentType).includes("application/json") && raw) {
          try {
            body = JSON.parse(raw);
          } catch (_) {
            body = raw;
          }
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          const resumo = typeof body === "string" ? body.slice(0, 2000) : JSON.stringify(body).slice(0, 2000);
          return reject(new Error(
            `TaxOne HTTP ${response.statusCode} ${response.statusMessage || ""}. URL=${url}. Retorno=${resumo}`
          ));
        }

        resolve(body);
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error(`Timeout conectando no TaxOne após ${taxoneExecution.timeoutMs}ms. URL=${url}`));
    });

    req.on("error", (err) => {
      reject(new Error(`Falha HTTP/TLS conectando no TaxOne. URL=${url}. Causa=${err.code || ""} ${err.message}`));
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}


// =============================================================
// EXECUÇÃO TAXONE VIA PUPPETEER
// Alternativa local sem F12: usa um perfil persistente do navegador.
// Primeira execução pode abrir o navegador para login manual. Depois a sessão
// fica salva no diretório TAXONE_BROWSER_USER_DATA_DIR.
// =============================================================
const taxoneBrowserSessions = new Map();

function getTaxOneExecutionMode() {
  return String(process.env.TAXONE_EXECUTION_MODE || (taxoneExecution.enabled ? "http" : "disabled")).toLowerCase();
}

function getTaxOneBrowserProfileDir(env) {
  const key = String(env || "").toLowerCase();

  if (key === "qas-icms") {
    return process.env.QAS_TAXONE_ICMS_BROWSER_USER_DATA_DIR ||
      path.join(__dirname, "data", "browser-profile-qas-icms");
  }

  if (key === "prd-icms") {
    return process.env.PRD_TAXONE_ICMS_BROWSER_USER_DATA_DIR ||
      path.join(__dirname, "data", "browser-profile-prd-icms");
  }

  return process.env[`${key.toUpperCase()}_TAXONE_BROWSER_USER_DATA_DIR`] ||
    process.env.TAXONE_BROWSER_USER_DATA_DIR ||
    path.join(__dirname, "data", `taxone-browser-profile-${key}`);
}

function getTaxOneBrowserHeadless() {
  return String(process.env.TAXONE_BROWSER_HEADLESS || "false").toLowerCase() === "true";
}

function getTaxOneBrowserChannel() {
  return process.env.TAXONE_BROWSER_CHANNEL || undefined; // ex.: chrome, msedge
}

function getTaxOneBrowserExecutablePath() {
  return process.env.TAXONE_BROWSER_EXECUTABLE_PATH || undefined;
}

function getTaxOneBrowserTimeoutMs() {
  return Number(process.env.TAXONE_BROWSER_TIMEOUT_MS || 180000);
}

function getTaxOneBrowserAutoLoginWithEnv() {
  return String(process.env.TAXONE_BROWSER_AUTO_LOGIN_WITH_ENV || "false").toLowerCase() === "true";
}

function getTaxOneBrowserAutoLoginTimeoutMs() {
  return Number(process.env.TAXONE_BROWSER_AUTO_LOGIN_TIMEOUT_MS || 45000);
}

function getTaxOneLoginEnvKey(env) {
  const key = String(env || "").toLowerCase();
  if (key.startsWith("prd")) return "prd";
  if (key.startsWith("qas")) return "qas";
  return key;
}

function getTaxOneLoginCredentialForEnv(env) {
  const key = getTaxOneLoginEnvKey(env);
  const cfg = taxoneExecution[key] || {};
  return {
    user: cfg.user || process.env[`${key.toUpperCase()}_TAXONE_USER`] || "",
    password: cfg.password || process.env[`${key.toUpperCase()}_TAXONE_PASSWORD`] || ""
  };
}

async function tentarLoginAutomaticoPuppeteer(page, env, keyUpper) {
  if (!getTaxOneBrowserAutoLoginWithEnv()) return false;

  const cred = getTaxOneLoginCredentialForEnv(env);
  if (!cred.user || !cred.password) {
    console.warn(`[TaxOne Puppeteer][${keyUpper}] Login automático habilitado, mas usuário/senha não estão configurados no .env.`);
    return false;
  }

  const timeoutMs = getTaxOneBrowserAutoLoginTimeoutMs();
  console.log(`[TaxOne Puppeteer][${keyUpper}] Tentando login automático com usuário do .env.`);

  try {
    await page.waitForSelector('input[type="password"], input[name="password"], input[id="password"]', { timeout: Math.min(timeoutMs, 15000) });
  } catch (_) {
    // Alguns formulários carregam campos de forma assíncrona; tenta mesmo assim pelo DOM.
  }

  const preencheu = await page.evaluate(({ user, password }) => {
    function visible(el) {
      if (!el) return false;
      const st = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return st && st.visibility !== 'hidden' && st.display !== 'none' && r.width > 0 && r.height > 0;
    }

    const inputs = Array.from(document.querySelectorAll('input'));
    const pass = inputs.find(i => visible(i) && (String(i.type).toLowerCase() === 'password' || /password|senha/i.test(`${i.name} ${i.id} ${i.placeholder}`)));
    const userInput = inputs.find(i => visible(i) && i !== pass && (
      /user|username|login|name|usu[aá]rio/i.test(`${i.name} ${i.id} ${i.placeholder}`) ||
      ['text', 'email', ''].includes(String(i.type || '').toLowerCase())
    ));

    function setValue(el, value) {
      if (!el) return;
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
    }

    setValue(userInput, user);
    setValue(pass, password);

    return Boolean(userInput && pass);
  }, cred);

  if (!preencheu) {
    console.warn(`[TaxOne Puppeteer][${keyUpper}] Não foi possível localizar os campos de login/senha para login automático.`);
    return false;
  }

  const clicou = await page.evaluate(() => {
    function visible(el) {
      if (!el) return false;
      const st = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return st && st.visibility !== 'hidden' && st.display !== 'none' && r.width > 0 && r.height > 0;
    }

    const candidates = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a'))
      .filter(visible);
    const btn = candidates.find(el => /entrar|login|logar|sign in|submit|continuar|acessar/i.test(`${el.innerText || ''} ${el.value || ''} ${el.title || ''} ${el.ariaLabel || ''}`)) || candidates[0];
    if (btn) { btn.click(); return true; }
    return false;
  });

  if (!clicou) {
    await page.keyboard.press('Enter').catch(() => {});
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1500));
    const state = await page.evaluate(() => {
      const url = window.location.href;
      const text = document.body ? document.body.innerText.slice(0, 2500) : '';
      return { url, text };
    }).catch(() => ({ url: '', text: '' }));

    const aindaLogin = /login|senha|password|usu[aá]rio|username|uaa-security/i.test(`${state.url}
${state.text}`);
    const chegouPortal = /\/sites/i.test(state.url) || /shell|home|taxone|relat[oó]rio|apura/i.test(state.text);
    if (!aindaLogin && chegouPortal) {
      console.log(`[TaxOne Puppeteer][${keyUpper}] Login automático concluído.`);
      return true;
    }
  }

  console.warn(`[TaxOne Puppeteer][${keyUpper}] Login automático não concluiu dentro de ${timeoutMs}ms.`);
  return false;
}


function getTaxOneBrowserCloseAfterExecution() {
  return String(process.env.TAXONE_BROWSER_CLOSE_AFTER_EXECUTION || "true").toLowerCase() !== "false";
}

function getTaxOneBrowserAutoHeadlessAfterLogin() {
  return String(process.env.TAXONE_BROWSER_AUTO_HEADLESS_AFTER_LOGIN || "true").toLowerCase() !== "false";
}

function getTaxOneBrowserLoginMarkerFile(env) {
  return path.join(getTaxOneBrowserProfileDir(env), ".taxone-login-ok");
}

function taxOneBrowserLoginMarkerExists(env) {
  try {
    return fs.existsSync(getTaxOneBrowserLoginMarkerFile(env));
  } catch (_) {
    return false;
  }
}

function gravarTaxOneBrowserLoginMarker(env) {
  try {
    const userDataDir = getTaxOneBrowserProfileDir(env);
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(getTaxOneBrowserLoginMarkerFile(env), JSON.stringify({
      env: String(env || "").toLowerCase(),
      authenticatedAt: new Date().toISOString()
    }, null, 2), "utf8");
  } catch (err) {
    console.warn(`[TaxOne Puppeteer][${String(env).toUpperCase()}] Não foi possível gravar marcador de login:`, err.message);
  }
}

function apagarTaxOneBrowserLoginMarker(env) {
  try {
    const marker = getTaxOneBrowserLoginMarkerFile(env);
    if (fs.existsSync(marker)) fs.unlinkSync(marker);
  } catch (_) {}
}

function getTaxOneBrowserHeadlessForEnv(env) {
  const explicitHeadless = String(process.env.TAXONE_BROWSER_HEADLESS || "false").toLowerCase() === "true";
  if (explicitHeadless) return true;

  // Opção C:
  // 1ª execução: abre janela para login manual.
  // Após detectar login, grava marcador no profile.
  // Próximas execuções: usa o mesmo profile em headless e fecha ao final.
  if (getTaxOneBrowserAutoHeadlessAfterLogin() && taxOneBrowserLoginMarkerExists(env)) {
    return true;
  }

  return false;
}

function isTaxOneBrowserConnected(browser) {
  if (!browser) return false;

  // Compatível com versões diferentes do Puppeteer.
  // Algumas possuem browser.isConnected(), outras não.
  try {
    if (typeof browser.isConnected === "function") return browser.isConnected();
  } catch (_) {}

  try {
    const proc = typeof browser.process === "function" ? browser.process() : null;
    if (proc && proc.killed) return false;
  } catch (_) {}

  return true;
}


function isBrowserUserDataDirLockedError(err) {
  const msg = String((err && err.message) || err || "");
  return /browser is already running|userDataDir|SingletonLock|profile.*in use|already.*running/i.test(msg);
}

function browserProfileLockedMessage(env) {
  const profile = (() => { try { return getTaxOneBrowserProfileDir(env); } catch (_) { return String(env || ""); } })();
  return `Perfil do navegador TaxOne em uso: ${profile}. Feche as janelas do Chrome/Edge abertas por essa automação ou finalize os processos node/chrome antigos e tente novamente.`;
}

function setTaxOneBrowserLockHeaders(res, env, detalhe) {
  res.setHeader("X-TaxOne-Browser-Profile-Locked", "true");
  res.setHeader("X-TaxOne-Browser-Profile", encodeURIComponent(String((() => { try { return getTaxOneBrowserProfileDir(env); } catch (_) { return env; } })())));
  if (detalhe) res.setHeader("X-TaxOne-Browser-Detail", encodeURIComponent(String(detalhe).slice(0, 500)));
}

async function closeTaxOneBrowser(env, motivo = "") {
  const key = String(env || "").toLowerCase();
  const atual = taxoneBrowserSessions.get(key);
  if (!atual?.browser) {
    taxoneBrowserSessions.delete(key);
    return;
  }

  try {
    // Não depender de browser.isConnected(), pois algumas versões não possuem esse método.
    await atual.browser.close();
    console.log(`[TaxOne Puppeteer][${key.toUpperCase()}] Browser fechado automaticamente${motivo ? ` (${motivo})` : ""}.`);
  } catch (err) {
    const msg = String(err && err.message || err || "");
    if (/closed|disconnected|not connected|target closed/i.test(msg)) {
      console.log(`[TaxOne Puppeteer][${key.toUpperCase()}] Browser já estava fechado${motivo ? ` (${motivo})` : ""}.`);
    } else {
      console.warn(`[TaxOne Puppeteer][${key.toUpperCase()}] Falha ao fechar browser:`, msg);
    }
  } finally {
    taxoneBrowserSessions.delete(key);
  }
}

async function getPuppeteerModule() {
  try {
    return require("puppeteer");
  } catch (err) {
    throw new Error(
      "Dependência puppeteer não instalada. Execute: npm install puppeteer. " +
      "Se preferir usar Chrome já instalado, instale puppeteer-core e ajuste o código, ou use TAXONE_BROWSER_EXECUTABLE_PATH."
    );
  }
}

async function getTaxOneBrowser(env) {
  const key = String(env || "").toLowerCase();
  if (taxoneBrowserSessions.has(key)) {
    const atual = taxoneBrowserSessions.get(key);
    if (isTaxOneBrowserConnected(atual?.browser)) return atual;
    taxoneBrowserSessions.delete(key);
  }

  
app.post("/api/taxone/browsers/fechar", async (req, res) => {
  const envs = Array.from(new Set([
    ...Array.from(taxoneBrowserSessions.keys()),
    "qas", "prd", "qas-icms", "prd-icms", efdSpedBrowserKey("qas"), efdSpedBrowserKey("prd")
  ]));

  const resultados = [];
  for (const env of envs) {
    try {
      await closeTaxOneBrowser(env, "fechamento manual solicitado pela interface");
      resultados.push({ env, status: "OK" });
    } catch (err) {
      resultados.push({ env, status: "ERRO", erro: err.message });
    }
  }

  res.json({ status: "OK", aviso: "Sessões controladas por este processo foram fechadas. Se o erro persistir, finalize processos Chrome/Edge/Node antigos no Windows.", resultados });
});

garantirArquivosAgendamento();
  const puppeteer = await getPuppeteerModule();
  const userDataDir = getTaxOneBrowserProfileDir(key);
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

  const launchOptions = {
    headless: getTaxOneBrowserHeadlessForEnv(key),
    userDataDir,
    ignoreHTTPSErrors: true,
    args: [
      "--ignore-certificate-errors",
      "--disable-features=IsolateOrigins,site-per-process",
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  };

  const executablePath = getTaxOneBrowserExecutablePath();
  const channel = getTaxOneBrowserChannel();
  if (executablePath) launchOptions.executablePath = executablePath;
  if (channel) launchOptions.channel = channel;

  const browser = await puppeteer.launch(launchOptions);
  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();
  page.setDefaultTimeout(getTaxOneBrowserTimeoutMs());
  page.setDefaultNavigationTimeout(getTaxOneBrowserTimeoutMs());

  const session = { browser, page, userDataDir, startedAt: new Date().toISOString() };
  taxoneBrowserSessions.set(key, session);
  console.log(`[TaxOne Puppeteer][${key.toUpperCase()}] Browser iniciado. Perfil=${userDataDir}. Headless=${launchOptions.headless ? "SIM" : "NAO"}`);
  return session;
}

async function ensureTaxOneLoggedInPuppeteer(env, browserKey = env) {
  const key = String(browserKey || env || "").toLowerCase();
  const keyUpper = key.toUpperCase();
  const baseUrl = getTaxOneBaseUrl(env);
  const sessao = await getTaxOneBrowser(key);
  let page = sessao.page;
  const sitesUrl = `${baseUrl}/sites`;

  async function paginaPareceLogin(pageAtual) {
    const currentUrl = pageAtual.url();
    const bodyText = await pageAtual.evaluate(() => document.body ? document.body.innerText.slice(0, 3000) : "").catch(() => "");
    return /login|senha|password|usu[aá]rio|username|uaa-security/i.test(currentUrl + "\n" + bodyText);
  }

  async function navegarComRetry() {
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      try {
        await page.goto(sitesUrl, { waitUntil: "networkidle2", timeout: getTaxOneBrowserTimeoutMs() });
        return;
      } catch (err) {
        const msg = String(err && err.message || err || "");
        if (!/frame was detached|navigating frame was detached|target closed|session closed/i.test(msg) || tentativa === 2) {
          throw err;
        }
        console.warn(`[TaxOne Puppeteer][${keyUpper}] Navegação inicial falhou (${msg}). Abrindo nova página e tentando novamente.`);
        try { await page.close({ runBeforeUnload: false }); } catch (_) {}
        const atual = taxoneBrowserSessions.get(key);
        page = await atual.browser.newPage();
        page.setDefaultTimeout(getTaxOneBrowserTimeoutMs());
        page.setDefaultNavigationTimeout(getTaxOneBrowserTimeoutMs());
        atual.page = page;
      }
    }
  }

  await navegarComRetry();

  const needsLogin = await paginaPareceLogin(page);

  if (needsLogin) {
    const loginOk = await tentarLoginAutomaticoPuppeteer(page, env, keyUpper);
    if (loginOk) {
      gravarTaxOneBrowserLoginMarker(key);
      return page;
    }
  }

  if (needsLogin && !getTaxOneBrowserHeadlessForEnv(key)) {
    console.log(`[TaxOne Puppeteer][${keyUpper}] Login necessário. O navegador foi aberto. Faça login no TaxOne; após autenticar, ele será fechado automaticamente ao final da execução.`);
    const deadline = Date.now() + getTaxOneBrowserTimeoutMs();

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2000));

      const url = page.url();
      const text = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 1500) : "").catch(() => "");
      const saiuDaTelaLogin = !/login|senha|password|usu[aá]rio|username|uaa-security/i.test(url + "\n" + text);
      const chegouNoPortal = /\/sites/i.test(url) || /shell|home|taxone|relat[oó]rio|apura/i.test(text);

      if (saiuDaTelaLogin && chegouNoPortal) {
        gravarTaxOneBrowserLoginMarker(key);
        console.log(`[TaxOne Puppeteer][${keyUpper}] Login detectado com sucesso. Sessão salva no profile; o browser será fechado automaticamente após a execução.`);
        return page;
      }
    }

    throw new Error(`Login do TaxOne não foi concluído no navegador dentro de ${getTaxOneBrowserTimeoutMs()}ms.`);
  }

  if (needsLogin && getTaxOneBrowserHeadlessForEnv(key)) {
    apagarTaxOneBrowserLoginMarker(key);
    await closeTaxOneBrowser(key, "sessão expirada");
    throw new Error("A sessão TaxOne expirou e o login automático não conseguiu autenticar. Valide usuário/senha no .env ou rode uma vez com TAXONE_BROWSER_HEADLESS=false.");
  }

  gravarTaxOneBrowserLoginMarker(key);
  return page;
}

async function obterCsrfPuppeteer(page, baseUrl) {
  return page.evaluate(async ({ baseUrl }) => {
    const candidatos = [
      `${baseUrl}/tax4b-tart-js/geracao_relatorio/geracao`,
      `${baseUrl}/tax4b-tart-js/relatorio/200/2026/06/7`
    ];
    for (const url of candidatos) {
      try {
        const resp = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers: {
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRF-Token": "Fetch"
          }
        });
        const token = resp.headers.get("x-csrf-token") || resp.headers.get("X-CSRF-Token");
        if (token && token.toLowerCase() !== "required") return token;
      } catch (_) {}
    }
    return "";
  }, { baseUrl });
}

async function chamarTaxOneViaPuppeteer(env, metodo, pathComQuery, payload = null, browserKey = env) {
  const keyUpper = String(browserKey || env || "").toUpperCase();
  const baseUrl = getTaxOneBaseUrl(env);
  const page = await ensureTaxOneLoggedInPuppeteer(env, browserKey);
  const url = `${baseUrl}${pathComQuery.startsWith("/") ? "" : "/"}${pathComQuery}`;
  const csrf = await obterCsrfPuppeteer(page, baseUrl).catch(() => "");

  const resultado = await page.evaluate(async ({ url, metodo, payload, csrf }) => {
    const headers = {
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest"
    };
    if (payload !== null && payload !== undefined) headers["Content-Type"] = "application/json;charset=UTF-8";
    if (csrf) {
      headers["X-CSRF-Token"] = csrf;
      headers["X-Csrf-Token"] = csrf;
    }

    const resp = await fetch(url, {
      method: metodo,
      credentials: "include",
      headers,
      body: payload !== null && payload !== undefined ? JSON.stringify(payload) : undefined
    });

    const text = await resp.text();
    let body = text;
    try { body = text ? JSON.parse(text) : null; } catch (_) {}

    return {
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      url: resp.url,
      csrfUsado: Boolean(csrf),
      body
    };
  }, { url, metodo, payload, csrf });

  if (!resultado.ok) {
    throw new Error(
      `TaxOne Puppeteer HTTP ${resultado.status} ${resultado.statusText}. URL=${url}. ` +
      `CSRF=${resultado.csrfUsado ? "SIM" : "NAO"}. Retorno=${typeof resultado.body === "string" ? resultado.body : JSON.stringify(resultado.body)}`
    );
  }

  console.log(`[TaxOne Puppeteer][${keyUpper}] ${metodo} ${pathComQuery} OK. CSRF=${resultado.csrfUsado ? "SIM" : "NAO"}`);
  return resultado.body;
}


async function chamarTaxOneViaPuppeteerRaw(env, metodo, pathComQuery, rawBody = null, extraHeaders = {}, browserKey = env) {
  const keyUpper = String(browserKey || env || "").toUpperCase();
  const baseUrl = getTaxOneBaseUrl(env);
  const page = await ensureTaxOneLoggedInPuppeteer(env, browserKey);
  const url = `${baseUrl}${pathComQuery.startsWith("/") ? "" : "/"}${pathComQuery}`;
  const csrf = await obterCsrfPuppeteer(page, baseUrl).catch(() => "");

  const resultado = await page.evaluate(async ({ url, metodo, rawBody, csrf, extraHeaders }) => {
    const headers = {
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      ...(extraHeaders || {})
    };
    if (csrf) {
      headers["X-CSRF-Token"] = csrf;
      headers["X-Csrf-Token"] = csrf;
    }

    const resp = await fetch(url, {
      method: metodo,
      credentials: "include",
      headers,
      body: rawBody !== null && rawBody !== undefined ? rawBody : undefined
    });

    const text = await resp.text();
    return { ok: resp.ok, status: resp.status, statusText: resp.statusText, url: resp.url, csrfUsado: Boolean(csrf), body: text };
  }, { url, metodo, rawBody, csrf, extraHeaders });

  if (!resultado.ok) {
    throw new Error(
      `TaxOne Puppeteer HTTP ${resultado.status} ${resultado.statusText}. URL=${url}. ` +
      `CSRF=${resultado.csrfUsado ? "SIM" : "NAO"}. Retorno=${String(resultado.body || "").slice(0, 2000)}`
    );
  }

  console.log(`[TaxOne Puppeteer][${keyUpper}] ${metodo} ${pathComQuery} OK. CSRF=${resultado.csrfUsado ? "SIM" : "NAO"}`);
  return resultado.body;
}


function parseBatchJsonPayloads(texto) {
  const raw = String(texto || "");
  const payloads = [];

  function tentarAdicionarJson(trecho) {
    if (!trecho) return;
    const limpo = String(trecho).trim();
    if (!limpo) return;
    try {
      const obj = JSON.parse(limpo);
      payloads.push(obj);
    } catch (_) {}
  }

  // Caso o retorno venha como JSON direto.
  tentarAdicionarJson(raw);

  // Caso venha multipart/mixed com um HTTP/1.1 interno.
  // Exemplo: HTTP/1.1 200 OK ... {"d":{"results":[...]}} --batch_xxx
  const candidatos = raw.match(/\{\s*"d"\s*:\s*[\s\S]*?\}\s*(?=\r?\n--|$)/g) || [];
  for (const candidato of candidatos) tentarAdicionarJson(candidato);

  // Scanner robusto: encontra blocos JSON balanceados começando em {"d".
  if (!payloads.length) {
    let pos = raw.indexOf('{"d"');
    while (pos >= 0) {
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = pos; i < raw.length; i++) {
        const ch = raw[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        if (ch === '}') {
          depth--;
          if (depth === 0) {
            tentarAdicionarJson(raw.slice(pos, i + 1));
            break;
          }
        }
      }
      pos = raw.indexOf('{"d"', pos + 4);
    }
  }

  // Último fallback: se por algum motivo o multipart não foi parseado,
  // extrai diretamente os CENTRAL_EFD do texto bruto.
  if (!payloads.length && raw.includes('CENTRAL_EFD')) {
    const results = [];
    const re = /"CENTRAL_EFD"\s*:\s*"([^"]+)"[\s\S]*?"EMPRESA_MAIN"\s*:\s*"([^"]*)"[\s\S]*?"FILIAL_MAIN"\s*:\s*"([^"]*)"[\s\S]*?"UF"\s*:\s*"([^"]*)"/g;
    for (const m of raw.matchAll(re)) {
      results.push({
        CENTRAL_EFD: m[1],
        EMPRESA_MAIN: m[2],
        FILIAL_MAIN: m[3],
        UF: m[4]
      });
    }
    if (results.length) payloads.push({ d: { results } });
  }

  return payloads;
}

function normalizarEstruturasIcms(payloads) {
  const itens = [];

  function coletar(obj) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach(coletar);
      return;
    }

    const container = obj.d || obj;
    if (Array.isArray(container.results)) {
      container.results.forEach(coletar);
      return;
    }

    const orgstr = container.CENTRAL_EFD || container.central_efd || container.ORGSTR || container.OrgStr || container.orgstr || container.ID || container.Id || container.id || container.VALUE || container.Value || container.value;
    const nome = container.DESCRICAO || container.Descricao || container.descricao || container.TEXT || container.Text || container.text || container.NOME || container.Nome || container.nome || container.CENTRAL_EFD || orgstr;

    if (orgstr && String(orgstr).trim()) {
      itens.push({
        orgstr: String(orgstr).trim(),
        nome: String(nome || orgstr).trim(),
        bruto: container
      });
    }
  }

  payloads.forEach(coletar);

  const vistos = new Set();
  return itens.filter(item => {
    if (vistos.has(item.orgstr)) return false;
    vistos.add(item.orgstr);
    return true;

  }).sort((a, b) => a.orgstr.localeCompare(b.orgstr));
}

function sqlIdent(nome) {
  return `"${String(nome).replace(/"/g, '""')}"`;
}


// Fallback local para ICMS quando o OData $batch retorna vazio no ambiente local/headless.
// Baseado no retorno oficial capturado do TaxOne QAS. Pode ser sobrescrito no .env
// usando TAXONE_ICMS_ORGSTR_LIST=ORG1,ORG2,ORG3.
const TAXONE_ICMS_ORGSTR_FALLBACK = [
  {
    "orgstr": "E0014_SP_CD_SBC",
    "nome": "E0014_SP_CD_SBC",
    "bruto": {
      "CENTRAL_EFD": "E0014_SP_CD_SBC",
      "EMPRESA_MAIN": "LB01",
      "FILIAL_MAIN": "0014",
      "UF": "SP",
      "CNPJ": "01438784001500"
    },
    "origem": "FALLBACK_LOCAL_TAXONE_CAPTURE"
  },
  {
    "orgstr": "E0031_RJ_BELFORD_ROX",
    "nome": "E0031_RJ_BELFORD_ROX",
    "bruto": {
      "CENTRAL_EFD": "E0031_RJ_BELFORD_ROX",
      "EMPRESA_MAIN": "LB01",
      "FILIAL_MAIN": "0031",
      "UF": "RJ",
      "CNPJ": "01438784003546"
    },
    "origem": "FALLBACK_LOCAL_TAXONE_CAPTURE"
  },
  {
    "orgstr": "E0037_SP_CD_CAJAMAR",
    "nome": "E0037_SP_CD_CAJAMAR",
    "bruto": {
      "CENTRAL_EFD": "E0037_SP_CD_CAJAMAR",
      "EMPRESA_MAIN": "LB01",
      "FILIAL_MAIN": "0037",
      "UF": "SP",
      "CNPJ": "01438784004194"
    },
    "origem": "FALLBACK_LOCAL_TAXONE_CAPTURE"
  },
  {
    "orgstr": "E0048_SC_CD_ITAJAI",
    "nome": "E0048_SC_CD_ITAJAI",
    "bruto": {
      "CENTRAL_EFD": "E0048_SC_CD_ITAJAI",
      "EMPRESA_MAIN": "LB01",
      "FILIAL_MAIN": "0048",
      "UF": "SC",
      "CNPJ": "01438784005328"
    },
    "origem": "FALLBACK_LOCAL_TAXONE_CAPTURE"
  },
  {
    "orgstr": "E0061_DF_PLATAFORMA",
    "nome": "E0061_DF_PLATAFORMA",
    "bruto": {
      "CENTRAL_EFD": "E0061_DF_PLATAFORMA",
      "EMPRESA_MAIN": "LB01",
      "FILIAL_MAIN": "0061",
      "UF": "DF",
      "CNPJ": "01438784006642"
    },
    "origem": "FALLBACK_LOCAL_TAXONE_CAPTURE"
  },
  {
    "orgstr": "E0066_SP_PLAT_URBANA",
    "nome": "E0066_SP_PLAT_URBANA",
    "bruto": {
      "CENTRAL_EFD": "E0066_SP_PLAT_URBANA",
      "EMPRESA_MAIN": "LB01",
      "FILIAL_MAIN": "0066",
      "UF": "SP",
      "CNPJ": "01438784007290"
    },
    "origem": "FALLBACK_LOCAL_TAXONE_CAPTURE"
  },
  {
    "orgstr": "E0073_BA_PL_SALVADOR",
    "nome": "E0073_BA_PL_SALVADOR",
    "bruto": {
      "CENTRAL_EFD": "E0073_BA_PL_SALVADOR",
      "EMPRESA_MAIN": "LB01",
      "FILIAL_MAIN": "0073",
      "UF": "BA",
      "CNPJ": "01438784007967"
    },
    "origem": "FALLBACK_LOCAL_TAXONE_CAPTURE"
  },
  {
    "orgstr": "E0080_CE_FORTALEZA",
    "nome": "E0080_CE_FORTALEZA",
    "bruto": {
      "CENTRAL_EFD": "E0080_CE_FORTALEZA",
      "EMPRESA_MAIN": "LB01",
      "FILIAL_MAIN": "0080",
      "UF": "CE",
      "CNPJ": "01438784008505"
    },
    "origem": "FALLBACK_LOCAL_TAXONE_CAPTURE"
  },
  {
    "orgstr": "E0099_SP_CD_ÚNICO",
    "nome": "E0099_SP_CD_ÚNICO",
    "bruto": {
      "CENTRAL_EFD": "E0099_SP_CD_ÚNICO",
      "EMPRESA_MAIN": "LB01",
      "FILIAL_MAIN": "0099",
      "UF": "SP",
      "CNPJ": "01438784006995"
    },
    "origem": "FALLBACK_LOCAL_TAXONE_CAPTURE"
  },
  {
    "orgstr": "E0519_RS_PLAT_CACHOE",
    "nome": "E0519_RS_PLAT_CACHOE",
    "bruto": {
      "CENTRAL_EFD": "E0519_RS_PLAT_CACHOE",
      "EMPRESA_MAIN": "LB01",
      "FILIAL_MAIN": "0519",
      "UF": "RS",
      "CNPJ": "01438784002221"
    },
    "origem": "FALLBACK_LOCAL_TAXONE_CAPTURE"
  },
  {
    "orgstr": "E0990_SP_LJ_VIRTUAL",
    "nome": "E0990_SP_LJ_VIRTUAL",
    "bruto": {
      "CENTRAL_EFD": "E0990_SP_LJ_VIRTUAL",
      "EMPRESA_MAIN": "LB01",
      "FILIAL_MAIN": "0990",
      "UF": "SP",
      "CNPJ": "01438784005832"
    },
    "origem": "FALLBACK_LOCAL_TAXONE_CAPTURE"
  },
  {
    "orgstr": "L0001_SP_INTERLAGOS",
    "nome": "L0001_SP_INTERLAGOS",
    "bruto": {
      "CENTRAL_EFD": "L0001_SP_INTERLAGOS",
      "EMPRESA_MAIN": "LB01",
      "FILIAL_MAIN": "0001",
      "UF": "SP",
      "CNPJ": "01438784000288"
    },
    "origem": "FALLBACK_LOCAL_TAXONE_CAPTURE"
  },
  {
    "orgstr": "L0002_SP_RIBEIRÃO",
    "nome": "L0002_SP_RIBEIRÃO",
    "bruto": {
      "CENTRAL_EFD": "L0002_SP_RIBEIRÃO",
      "EMPRESA_MAIN": "LB01",
      "FILIAL_MAIN": "0002",
      "UF": "SP",
      "CNPJ": "01438784000369"
    },
    "origem": "FALLBACK_LOCAL_TAXONE_CAPTURE"
  },
  {
    "orgstr": "L0003_SP_CAMPINAS",
    "nome": "L0003_SP_CAMPINAS",
    "bruto": {
      "CENTRAL_EFD": "L0003_SP_CAMPINAS",
      "EMPRESA_MAIN": "LB01",
      "FILIAL_MAIN": "0003",
      "UF": "SP",
      "CNPJ": "01438784000440"
    },
    "origem": "FALLBACK_LOCAL_TAXONE_CAPTURE"
  },
  {
    "orgstr": "L0004_MG_CONTAGEM",
    "nome": "L0004_MG_CONTAGEM",
    "bruto": {
      "CENTRAL_EFD": "L0004_MG_CONTAGEM",
      "EMPRESA_MAIN": "LB01",
      "FILIAL_MAIN": "0004",
      "UF": "MG",
      "CNPJ": "01438784000520"
    },
    "origem": "FALLBACK_LOCAL_TAXONE_CAPTURE"
  },
  {
    "orgstr": "L0005_SP_RAPOSO",
    "nome": "L0005_SP_RAPOSO",
    "bruto": {
      "CENTRAL_EFD": "L0005_SP_RAPOSO",
      "EMPRESA_MAIN": "LB01",
      "FILIAL_MAIN": "0005",
      "UF": "SP",
      "CNPJ": "01438784000601"
    },
    "origem": "FALLBACK_LOCAL_TAXONE_CAPTURE"
  },
  {
    "orgstr": "L0007_RJ_RIO_NORTE",
    "nome": "L0007_RJ_RIO_NORTE",
    "bruto": {
      "CENTRAL_EFD": "L0007_RJ_RIO_NORTE",
      "EMPRESA_MAIN": "LB01",
      "FILIAL_MAIN": "0007",
      "UF": "RJ",
      "CNPJ": "01438784000792"
    },
    "origem": "FALLBACK_LOCAL_TAXONE_CAPTURE"
  },
  {
    "orgstr": "L0008_SP_LESPACE",
    "nome": "L0008_SP_LESPACE",
    "bruto": {
      "CENTRAL_EFD": "L0008_SP_LESPACE",
      "EMPRESA_MAIN": "LB01",
      "FILIAL_MAIN": "0008",
      "UF": "SP",
      "CNPJ": "01438784000954"
    },
    "origem": "FALLBACK_LOCAL_TAXONE_CAPTURE"
  },
  {
    "orgstr": "L0009_PR_CURITIBA",
    "nome": "L0009_PR_CURITIBA",
    "bruto": {
      "CENTRAL_EFD": "L0009_PR_CURITIBA",
      "EMPRESA_MAIN": "LB01",
      "FILIAL_MAIN": "0009",
      "UF": "PR",
      "CNPJ": "01438784001098"
    },
    "origem": "FALLBACK_LOCAL_TAXONE_CAPTURE"
  },
  {
    "orgstr": "L0010_SP_SÃO_CAETANO",
    "nome": "L0010_SP_SÃO_CAETANO",
    "bruto": {
      "CENTRAL_EFD": "L0010_SP_SÃO_CAETANO",
      "EMPRESA_MAIN": "LB01",
      "FILIAL_MAIN": "0010",
      "UF": "SP",
      "CNPJ": "01438784001179"
    },
    "origem": "FALLBACK_LOCAL_TAXONE_CAPTURE"
  }
];

function listarEstruturasIcmsFallbackLocal() {
  const envList = String(process.env.TAXONE_ICMS_ORGSTR_LIST || '').trim();
  if (envList) {
    return envList
      .split(/[;,\n]/)
      .map(v => String(v || '').trim())
      .filter(Boolean)
      .map(v => ({
        orgstr: v,
        nome: v,
        bruto: { CENTRAL_EFD: v },
        origem: 'ENV:TAXONE_ICMS_ORGSTR_LIST'
      }))
      .sort((a, b) => a.orgstr.localeCompare(b.orgstr));
  }

  try {
    const arquivo = path.join(__dirname, 'data', 'icms-orgstr.json');
    if (fs.existsSync(arquivo)) {
      const json = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      if (Array.isArray(json) && json.length) {
        return json
          .map(item => ({
            orgstr: String(item.orgstr || item.CENTRAL_EFD || item.nome || '').trim(),
            nome: String(item.nome || item.orgstr || item.CENTRAL_EFD || '').trim(),
            bruto: item.bruto || item,
            origem: item.origem || 'DATA:icms-orgstr.json'
          }))
          .filter(item => item.orgstr)
          .sort((a, b) => a.orgstr.localeCompare(b.orgstr));
      }
    }
  } catch (err) {
    console.warn(`[TaxOne ICMS] Falha ao carregar data/icms-orgstr.json: ${err.message}`);
  }

  return TAXONE_ICMS_ORGSTR_FALLBACK
    .map(item => ({ ...item, origem: item.origem || 'FALLBACK_LOCAL_TAXONE_CAPTURE' }))
    .sort((a, b) => a.orgstr.localeCompare(b.orgstr));
}

async function listarEstruturasIcmsHana(env) {
  const ambiente = getAmbiente(env);
  const mandt = process.env.TAXONE_ICMS_MANDT || "200";
  const explicitObject = String(process.env.TAXONE_ICMS_ORGSTR_HANA_OBJECT || "").trim();

  console.warn(`[TaxOne ICMS] OData retornou vazio. Tentando carregar Estruturas Organizacionais diretamente pelo HANA no schema ${ambiente.schema}.`);

  let candidatos = [];

  if (explicitObject) {
    candidatos.push({ TABLE_NAME: explicitObject });
  }

  try {
    const encontrados = await runQuery(ambiente, `
      select
        table_name as "TABLE_NAME",
        sum(case when upper(column_name) = 'CENTRAL_EFD' then 1 else 0 end) as "HAS_CENTRAL_EFD",
        sum(case when upper(column_name) = 'ORGSTR' then 1 else 0 end) as "HAS_ORGSTR",
        sum(case when upper(column_name) = 'EMPRESA_MAIN' then 1 else 0 end) as "HAS_EMPRESA_MAIN",
        sum(case when upper(column_name) = 'FILIAL_MAIN' then 1 else 0 end) as "HAS_FILIAL_MAIN",
        sum(case when upper(column_name) = 'UF' then 1 else 0 end) as "HAS_UF"
      from sys.table_columns
      where schema_name = ?
        and (
             upper(table_name) like '%ORGSTR%'
          or upper(table_name) like '%ORGAN%'
          or upper(table_name) like '%CENTRAL%EFD%'
        )
      group by table_name
      having sum(case when upper(column_name) in ('CENTRAL_EFD','ORGSTR') then 1 else 0 end) > 0
      order by
        sum(case when upper(column_name) = 'CENTRAL_EFD' then 1 else 0 end) desc,
        table_name asc
    `, [ambiente.schema]);

    candidatos = candidatos.concat(encontrados || []);
  } catch (err) {
    console.warn(`[TaxOne ICMS] Falha ao descobrir objetos HANA de Estrutura Organizacional: ${err.message}`);
  }

  const nomesFixos = [
    'tax4b.icms::CV_ORGSTR',
    'tax4b.icms::CV_ORGSTR_PARAM',
    'tax4b.icms::ORGSTR',
    'tax4b.icms::AT_ORGSTR',
    'tax4b.icms::TF_ORGSTR'
  ];

  for (const nome of nomesFixos) {
    if (!candidatos.some(c => String(c.TABLE_NAME) === nome)) candidatos.push({ TABLE_NAME: nome });
  }

  const vistosTabela = new Set();

  for (const candidato of candidatos) {
    const tabela = String(candidato.TABLE_NAME || candidato.table_name || "").trim();
    if (!tabela || vistosTabela.has(tabela)) continue;
    vistosTabela.add(tabela);

    try {
      const colsRows = await runQuery(ambiente, `
        select column_name as "COLUMN_NAME"
        from sys.table_columns
        where schema_name = ?
          and table_name = ?
      `, [ambiente.schema, tabela]);

      const cols = new Set((colsRows || []).map(r => String(r.COLUMN_NAME || r.column_name || "").toUpperCase()));
      if (!cols.size) continue;

      const orgCol = cols.has('CENTRAL_EFD') ? 'CENTRAL_EFD' : (cols.has('ORGSTR') ? 'ORGSTR' : null);
      if (!orgCol) continue;

      const expr = (col, alias, fallback = "''") => cols.has(col)
        ? `${sqlIdent(col)} as ${sqlIdent(alias)}`
        : `${fallback} as ${sqlIdent(alias)}`;

      const whereMandt = cols.has('MANDT') ? `where ${sqlIdent('MANDT')} = ?` : '';
      const params = cols.has('MANDT') ? [mandt] : [];

      const sql = `
        select distinct top 500
          ${sqlIdent(orgCol)} as "ORGSTR",
          ${sqlIdent(orgCol)} as "NOME",
          ${expr('EMPRESA_MAIN', 'EMPRESA_MAIN')},
          ${expr('FILIAL_MAIN', 'FILIAL_MAIN')},
          ${expr('UF', 'UF')},
          ${expr('CNPJ', 'CNPJ')},
          ${expr('CNPJ_ROOT', 'CNPJ_ROOT')}
        from ${sqlIdent(ambiente.schema)}.${sqlIdent(tabela)}
        ${whereMandt}
        order by ${sqlIdent(orgCol)} asc
      `;

      const rows = await runQuery(ambiente, sql, params);
      const estruturas = (rows || [])
        .map(row => ({
          orgstr: String(row.ORGSTR || row.orgstr || "").trim(),
          nome: String(row.NOME || row.nome || row.ORGSTR || "").trim(),
          bruto: row,
          origem: `HANA:${tabela}`
        }))
        .filter(item => item.orgstr);

      if (estruturas.length) {
        console.log(`[TaxOne ICMS] Estruturas carregadas via HANA. Objeto=${tabela}; total=${estruturas.length}`);
        return estruturas.sort((a, b) => a.orgstr.localeCompare(b.orgstr));
      }
    } catch (err) {
      console.warn(`[TaxOne ICMS] Objeto HANA ignorado para Estruturas (${tabela}): ${err.message}`);
    }
  }

  console.warn('[TaxOne ICMS] Nenhuma Estrutura Organizacional encontrada via OData nem fallback HANA. Usando fallback local configurável.');
  const fallbackLocal = listarEstruturasIcmsFallbackLocal();
  if (fallbackLocal.length) {
    console.log(`[TaxOne ICMS] Estruturas carregadas via fallback local. total=${fallbackLocal.length}`);
    return fallbackLocal;
  }
  return [];
}

async function prepararContextoIcmsPuppeteer(env, page) {
  const baseUrl = getTaxOneBaseUrl(env);
  const icmsUrl = `${baseUrl}/sites#icms-show&/Apuracoes`;

  try {
    // Alguns endpoints OData do ICMS dependem do contexto da aplicação UI5 já carregado
    // no navegador. Portanto, antes de chamar o $batch, abrimos a rota oficial do ICMS
    // no mesmo profile/sessão que será usado pelo fetch.
    if (!String(page.url() || "").includes("icms-show")) {
      await page.goto(icmsUrl, { waitUntil: "networkidle2", timeout: getTaxOneBrowserTimeoutMs() });
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch (err) {
    console.warn(`[TaxOne ICMS] Não foi possível preparar contexto UI5 antes do $batch: ${err.message}`);
  }
}

async function chamarTaxOneBatchViaPuppeteer(env, pathComQuery, batchBody, browserKey = env) {
  const baseUrl = getTaxOneBaseUrl(env);
  const page = await ensureTaxOneLoggedInPuppeteer(env, browserKey);

  if (String(pathComQuery || "").includes("tax4b-icms-odata")) {
    await prepararContextoIcmsPuppeteer(env, page);
  }

  const url = `${baseUrl}${pathComQuery.startsWith("/") ? "" : "/"}${pathComQuery}`;
  const boundaryMatch = String(batchBody).match(/^--([^\r\n-]+)/);
  const boundary = boundaryMatch ? boundaryMatch[1] : `batch_${Date.now()}`;

  const resultado = await page.evaluate(async ({ url, batchBody, boundary }) => {
    const resp = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Accept": "multipart/mixed",
        "Content-Type": `multipart/mixed;boundary=${boundary}`,
        "DataServiceVersion": "2.0",
        "MaxDataServiceVersion": "2.0",
        "Accept-Language": "pt-BR",
        "sap-cancel-on-close": "true",
        "sap-contextid-accept": "header"
      },
      body: batchBody
    });

    const text = await resp.text();
    return {
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      body: text
    };
  }, { url, batchBody, boundary });

  if (!resultado.ok) {
    throw new Error(`TaxOne ICMS Batch HTTP ${resultado.status} ${resultado.statusText}. URL=${url}. Retorno=${String(resultado.body).slice(0, 2000)}`);
  }

  return resultado.body;
}

function montarPeriodoDatas(periodo) {
  const mes = Number(periodo.mes);
  const ano = Number(periodo.ano);
  const periodoValidado = validarPeriodo(mes, ano);
  return {
    ...periodoValidado,
    dtInicial: periodoValidado.dt_inicial,
    dtFinal: periodoValidado.dt_final
  };
}

function montarPeriodoDatasIcmsEstruturas(periodo) {
  // IMPORTANTE - ICMS / Estrutura Organizacional:
  // A tela oficial do TaxOne busca as estruturas por uma Calculation View com input parameters.
  // O retorno referencia o entity set ORGSTR no __metadata, mas a chamada correta é:
  // ORGSTR_PARAM(P_DT_INICIAL='YYYYMMDD',P_DT_FINAL='YYYYMMDD')/Results.
  const base = montarPeriodoDatas(periodo);
  const anoInicial = Number(base.ano) - 1;

  return {
    ...base,
    dtInicial: `${anoInicial}1201`,
    dtFinal: base.dtFinal
  };
}

async function chamarTaxOneIcmsGetJsonViaPuppeteer(env, pathComQuery, browserKey = env) {
  const baseUrl = getTaxOneBaseUrl(env);
  const page = await ensureTaxOneLoggedInPuppeteer(env, browserKey);
  const url = `${baseUrl}${pathComQuery.startsWith("/") ? "" : "/"}${pathComQuery}`;

  const resultado = await page.evaluate(async ({ url }) => {
    const resp = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        "Accept": "application/json",
        "Accept-Language": "pt-BR",
        "DataServiceVersion": "2.0",
        "MaxDataServiceVersion": "2.0",
        "Accept-Language": "pt-BR",
        "sap-cancel-on-close": "true",
        "sap-contextid-accept": "header"
      }
    });

    const text = await resp.text();
    let body = text;
    try { body = text ? JSON.parse(text) : null; } catch (_) {}

    return {
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      body
    };
  }, { url });

  if (!resultado.ok) {
    throw new Error(`TaxOne ICMS OData HTTP ${resultado.status} ${resultado.statusText}. URL=${url}. Retorno=${typeof resultado.body === "string" ? resultado.body : JSON.stringify(resultado.body)}`);
  }

  return resultado.body;
}

async function listarEstruturasIcmsPuppeteer(env, periodo) {
  const appId = encodeURIComponent("tax4b.icms.ui");
  const datas = montarPeriodoDatasIcmsEstruturas(periodo);
  const browserKey = `${String(env).toLowerCase()}-icms`;
  const pageSize = Number(process.env.TAXONE_ICMS_ORGSTR_PAGE_SIZE || 20);
  const maxPages = Number(process.env.TAXONE_ICMS_ORGSTR_MAX_PAGES || 20);

  try {
    // Replicamos o comportamento da tela oficial do TaxOne:
    // OData $batch, paginação de 20 em 20 e janela ampla de datas.
    // Exemplo observado no response oficial: entity set ORGSTR com CENTRAL_EFD
    console.log(`[TaxOne ICMS] Carregando Estruturas via ORGSTR_PARAM/Results. P_DT_INICIAL=${datas.dtInicial}; P_DT_FINAL=${datas.dtFinal}; pageSize=${pageSize}`);

    const todas = [];
    const vistos = new Set();

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
      const skip = pageIndex * pageSize;
      const boundary = `batch_${Date.now()}_${pageIndex}`;
      const batchBody = `--${boundary}\r\n` +
        `Content-Type: application/http\r\n` +
        `Content-Transfer-Encoding: binary\r\n\r\n` +
        `GET ORGSTR_PARAM(P_DT_INICIAL='${datas.dtInicial}',P_DT_FINAL='${datas.dtFinal}')/Results?$skip=${skip}&$top=${pageSize}&$inlinecount=allpages HTTP/1.1\r\n` +
        `sap-cancel-on-close: true\r\n` +
        `sap-contextid-accept: header\r\n` +
        `Accept: application/json\r\n` +
        `Accept-Language: pt-BR\r\n` +
        `DataServiceVersion: 2.0\r\n` +
        `MaxDataServiceVersion: 2.0\r\n\r\n` +
        `--${boundary}--\r\n`;

      const raw = await chamarTaxOneBatchViaPuppeteer(
        env,
        `/~1.0.0~/tax4b-icms-odata/OD_ICMS.xsodata/$batch?portalInterceptorAppId=${appId}`,
        batchBody,
        browserKey
      );

      const payloads = parseBatchJsonPayloads(raw);
      const estruturas = normalizarEstruturasIcms(payloads);

      if (!estruturas.length) {
        if (pageIndex === 0) {
          console.warn(`[TaxOne ICMS] $batch retornou resposta sem estruturas reconhecidas. Trecho inicial: ${String(raw).slice(0, 500)}`);
        }
        break;
      }

      for (const item of estruturas) {
        if (!vistos.has(item.orgstr)) {
          vistos.add(item.orgstr);
          todas.push(item);
        }
      }

      // Última página: veio menos que o tamanho solicitado.
      if (estruturas.length < pageSize) break;
    }

    if (!todas.length) {
      return listarEstruturasIcmsHana(env);
    }

    return todas.sort((a, b) => a.orgstr.localeCompare(b.orgstr));
  } finally {
    if (getTaxOneBrowserCloseAfterExecution()) {
      await closeTaxOneBrowser(browserKey, "fim da listagem de Estruturas ICMS");
    }
  }
}

async function executarApuracaoIcmsPuppeteer(env, periodo, orgstr, orgstrNome = "") {
  const appId = encodeURIComponent("tax4b.icms.ui");
  const payload = {
    MANDT: process.env.TAXONE_ICMS_MANDT || "200",
    ORGSTR: orgstr,
    EMPRESA: "*",
    FILIAL: "*",
    ANO: String(periodo.ano),
    PERIODO: String(periodo.periodo || periodo.mes).padStart(2, "0")
  };

  try {
    const retorno = await chamarTaxOneViaPuppeteer(
      env,
      "POST",
      `${process.env.TAXONE_ICMS_GERAR_ENDPOINT || "/~1.0.0~/tax4b-icms-js/cache/gerar/"}?portalInterceptorAppId=${appId}`,
      payload,
      `${String(env).toLowerCase()}-icms`
    );

    return {
      modulo: "icms",
      moduloNome: "Apuração de ICMS",
      ambiente: getAmbiente(env).nome,
      orgstr,
      orgstrNome: orgstrNome || orgstr,
      periodo,
      status: retorno === true || retorno === "true" ? "ENVIADO_AO_TAXONE" : "RETORNO_TAXONE",
      payload_enviado: payload,
      retorno
    };
  } finally {
    if (getTaxOneBrowserCloseAfterExecution()) {
      await closeTaxOneBrowser(`${String(env).toLowerCase()}-icms`, "fim da execução ICMS via Puppeteer");
    }
  }
}

async function executarRelatorioTaxOnePuppeteer(env, ambiente, row, periodo) {
  const appId = encodeURIComponent(taxoneExecution.portalInterceptorAppId);
  const payload = montarPayloadTaxOne(row, periodo);

  try {
    const retorno = await chamarTaxOneViaPuppeteer(
      env,
      "POST",
      `/tax4b-tart-js/geracao_relatorio/geracao?portalInterceptorAppId=${appId}`,
      payload
    );

    let statusTaxOne = null;
    try {
      statusTaxOne = await chamarTaxOneViaPuppeteer(
        env,
        "GET",
        `/tax4b-tart-js/relatorio/${encodeURIComponent(row.MANDT)}/${encodeURIComponent(periodo.ano)}/${encodeURIComponent(periodo.periodo)}/${encodeURIComponent(row.GRUPO_ID)}?portalInterceptorAppId=${appId}`,
        null
      );
    } catch (err) {
      statusTaxOne = {
        aviso: "Execução enviada, porém não foi possível consultar status via Puppeteer.",
        detalhe: err.message
      };
    }

    const itemStatus = Array.isArray(statusTaxOne)
      ? statusTaxOne.find(item => String(item.ID) === String(row.ID))
      : null;

    return {
      ...montarPayloadExecucao(
        ambiente,
        row,
        periodo,
        "ENVIADO_AO_TAXONE_PUPPETEER",
        "Solicitação enviada ao TaxOne usando sessão persistente do navegador/Puppeteer."
      ),
      taxone: {
        modo: "PUPPETEER_BROWSER_SESSION",
        endpoint_geracao: "/tax4b-tart-js/geracao_relatorio/geracao",
        payload_enviado: payload,
        retorno_geracao: retorno,
        status_relatorio: itemStatus,
        status_consulta: statusTaxOne
      }
    };
  } finally {
    if (getTaxOneBrowserCloseAfterExecution()) {
      await closeTaxOneBrowser(env, "fim da execução Puppeteer");
    }
  }
}

function montarPayloadTaxOne(row, periodo) {
  return {
    ID: row.ID,
    GRUPO_ID: row.GRUPO_ID,
    FONTE_ID: row.FONTE_ID,
    FONTE: row.FONTE || row.FONTE_DESC || row.CV_FONTE || "",
    MANDT: row.MANDT,
    EMPRESA: row.EMPRESA || "*",
    ORGSTR: row.ORGSTR || "*",
    NOME: row.NOME,
    TIPO: row.TIPO || "P",
    TIPO_EXPORTACAO: row.TIPO_EXPORTACAO || "xlsx",
    DT_INICIAL: periodo.dt_inicial,
    DT_FINAL: null,
    STATUS: 0,
    STATUS_DESC: "Não gerado",
    ANO: String(periodo.ano),
    PERIODO: periodo.periodo
  };
}

function montarPayloadExecucao(ambiente, row, periodo, status, observacao) {
  return {
    ambiente: ambiente.nome,
    relatorio: {
      id: row.ID,
      grupo_id: row.GRUPO_ID,
      nome: row.NOME,
      fonte_id: row.FONTE_ID,
      mandt: row.MANDT,
      empresa: row.EMPRESA,
      orgstr: row.ORGSTR,
      tipo: row.TIPO,
      tipo_exportacao: row.TIPO_EXPORTACAO || "xlsx",
      dt_inicial_cadastro: row.DT_INICIAL,
      dt_final_cadastro: row.DT_FINAL,
      cv_fonte: row.CV_FONTE
    },
    parametros: periodo,
    status,
    observacao
  };
}

async function buscarRelatoriosPorIds(ambiente, relatorioIds) {
  const ids = relatorioIds.map(id => String(id).trim()).filter(Boolean);

  if (!ids.length) {
    throw new Error("Informe ao menos um relatório.");
  }

  const placeholders = ids.map(() => "?").join(",");

  const sql = `
    select
      "GRUPO_ID",
      "ID",
      "NOME",
      "FONTE_ID",
      "MANDT",
      "EMPRESA",
      "ORGSTR",
      "TIPO",
      "TIPO_EXPORTACAO",
      "DT_INICIAL",
      "DT_FINAL",
      "CV_FONTE"
    from "${ambiente.schema}"."tax4b.tart::CD_RELATORIO.RELATORIO"
    where "ID" in (${placeholders})
    order by "NOME" asc
  `;

  return runQuery(ambiente, sql, ids);
}

async function executarRelatorioTaxOne(env, ambiente, row, periodo, reqHeaders = {}) {
  const payload = montarPayloadTaxOne(row, periodo);
  const executionMode = getTaxOneExecutionMode();

  // MODO PUPPETEER:
  // Roda localmente sem F12 e sem atualizar .env. Usa um perfil persistente do navegador.
  // Na primeira vez, o navegador abre para login manual. Depois a sessão fica salva.
  if (executionMode === "puppeteer") {
    return executarRelatorioTaxOnePuppeteer(env, ambiente, row, periodo);
  }

  // MODO SEM TAXONE HTTP:
  // Neste ambiente XSA/OIDC, o endpoint /tax4b-tart-js/geracao_relatorio/geracao
  // exige sessão web do App Router e não aceita de forma estável cookies copiados para .env.
  // Quando TAXONE_EXECUTION_ENABLED=false, a aplicação NÃO tenta executar via TaxOne HTTP
  // e retorna uma resposta controlada para o frontend/log, sem falhar por 401.
  if (!taxoneExecution.enabled) {
    return {
      ...montarPayloadExecucao(
        ambiente,
        row,
        periodo,
        "NAO_ENVIADO_AO_TAXONE",
        "Execução HTTP TaxOne desabilitada por TAXONE_EXECUTION_ENABLED=false. Relatório validado no HANA, mas não enviado para geração no TaxOne."
      ),
      taxone: {
        modo: "DESABILITADO",
        motivo: "Endpoint TaxOne requer sessão web/OIDC do navegador. Para execução real sem cookie manual, publique o Node atrás do mesmo App Router/proxy autenticado ou implemente execução nativa por HANA/procedure.",
        payload_nao_enviado: payload
      }
    };
  }

  const baseUrl = getTaxOneBaseUrl(env);
  const appId = encodeURIComponent(taxoneExecution.portalInterceptorAppId);
  const headers = await getAuthHeadersAuto(env, reqHeaders);

  const url = `${baseUrl}/tax4b-tart-js/geracao_relatorio/geracao?portalInterceptorAppId=${appId}`;

  const retorno = await callTaxOneHttpWithAutoLogin(env, url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  const statusTaxOne = await consultarStatusGrupoTaxOne(env, row.MANDT, periodo.ano, periodo.periodo, row.GRUPO_ID, reqHeaders)
    .catch(err => ({
      aviso: "Execução enviada, porém não foi possível consultar o status automaticamente.",
      detalhe: err.message
    }));

  const itemStatus = Array.isArray(statusTaxOne)
    ? statusTaxOne.find(item => String(item.ID) === String(row.ID))
    : null;

  return {
    ...montarPayloadExecucao(
      ambiente,
      row,
      periodo,
      "ENVIADO_AO_TAXONE",
      "Solicitação enviada ao endpoint HTTP real do TaxOne."
    ),
    taxone: {
      endpoint_geracao: "/tax4b-tart-js/geracao_relatorio/geracao",
      endpoint_status: `/tax4b-tart-js/relatorio/${row.MANDT}/${periodo.ano}/${periodo.periodo}/${row.GRUPO_ID}`,
      payload_enviado: payload,
      retorno_geracao: retorno,
      status_relatorio: itemStatus,
      status_consulta: statusTaxOne
    }
  };
}

async function consultarStatusGrupoTaxOne(env, mandt, ano, periodo, grupoId, reqHeaders = {}) {
  const baseUrl = getTaxOneBaseUrl(env);
  const appId = encodeURIComponent(taxoneExecution.portalInterceptorAppId);
  const pathStatus = `/tax4b-tart-js/relatorio/${encodeURIComponent(mandt)}/${encodeURIComponent(ano)}/${encodeURIComponent(periodo)}/${encodeURIComponent(grupoId)}?portalInterceptorAppId=${appId}`;

  // Quando o modo Puppeteer estiver ativo, a LISTAGEM também deve consultar o TaxOne
  // usando a sessão persistente do navegador. Isso evita exibir relatórios extras do HANA
  // que não aparecem oficialmente no TaxOne para o grupo/período.
  if (getTaxOneExecutionMode() === "puppeteer") {
    try {
      return await chamarTaxOneViaPuppeteer(env, "GET", pathStatus, null);
    } finally {
      if (getTaxOneBrowserCloseAfterExecution()) {
        await closeTaxOneBrowser(env, "fim da consulta de status/listagem via Puppeteer");
      }
    }
  }

  const headers = await getAuthHeadersAuto(env, reqHeaders);
  const url = `${baseUrl}${pathStatus}`;

  return callTaxOneHttpWithAutoLogin(env, url, {
    method: "GET",
    headers: {
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Cookie": headers.Cookie,
      "X-Requested-With": "XMLHttpRequest",
      ...(headers["X-CSRF-Token"] ? { "X-CSRF-Token": headers["X-CSRF-Token"] } : {})
    }
  });
}

function erroDetalhado(res, err) {
  return res.status(500).json({
    erro: err.message,
    detalhe: "Falha ao enviar execução real ao TaxOne. Verifique .env, cookie, CSRF, base URL e se o Node foi reiniciado.",
    checklist: [
      "Confirme TAXONE_EXECUTION_ENABLED=true.",
      "Confirme PRD_TAXONE_BASE_URL/QAS_TAXONE_BASE_URL.",
      "Confirme QAS_TAXONE_COOKIE/PRD_TAXONE_COOKIE copiado do Request Headers > Cookie.",
      "Confirme QAS_TAXONE_CSRF_TOKEN/PRD_TAXONE_CSRF_TOKEN copiado do Request Headers > X-CSRF-Token.",
      "Confirme mês e ano no body ou query string.",
      "Confirme que o console mostra: TaxOne EXECUCAO REAL HTTP FINAL."
    ]
  });
}

app.get("/api/health/:env", (req, res) => {
  try {
    const ambiente = getAmbiente(req.params.env);
    res.json({
      status: "ok",
      message: `Configuração carregada para ${ambiente.nome}`,
      host: ambiente.host,
      port: ambiente.port,
      schema: ambiente.schema
    });
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});

app.get("/api/:env/config-execucao", (req, res) => {
  try {
    const ambiente = getAmbiente(req.params.env);
    const key = String(req.params.env || "").toLowerCase();
    const baseUrl = taxoneExecution[key]?.baseUrl || "";

    res.json({
      ambiente: ambiente.nome,
      hana: {
        host: ambiente.host,
        port: ambiente.port,
        schema: ambiente.schema,
        user_configurado: Boolean(ambiente.user),
        password_configurado: Boolean(ambiente.password)
      },
      taxone: {
        enabled: taxoneExecution.enabled,
        baseUrl_configurada: Boolean(baseUrl),
        baseUrl,
        cookie_configurado: Boolean((taxoneExecution[key] && taxoneExecution[key].cookie) || taxoneExecution.cookie),
        csrf_configurado: Boolean((taxoneExecution[key] && taxoneExecution[key].csrfToken) || taxoneExecution.csrfToken),
        auto_login_habilitado: taxoneExecution.autoLoginEnabled,
        usuario_login_configurado: Boolean(taxoneExecution[key]?.user),
        senha_login_configurada: Boolean(taxoneExecution[key]?.password),
        login_url: montarTaxOneLoginUrl(key),
        login_mode: taxoneExecution.loginMode,
        sessao_cache_ativa: Boolean(taxoneSessionCache[key]?.cookie),
        sessao_cache_atualizada_em: taxoneSessionCache[key]?.updatedAt,
        portalInterceptorAppId: taxoneExecution.portalInterceptorAppId,
        filtro_obrigatorio_taxone: taxoneFilterStrict,
        execution_mode: getTaxOneExecutionMode()
      }
    });
  } catch (err) {
    erroDetalhado(res, err);
  }
});

app.post("/api/:env/renovar-sessao-taxone", async (req, res) => {
  try {
    const sessao = await renovarSessaoTaxOne(req.params.env);
    res.json({
      status: "OK",
      ambiente: String(req.params.env || "").toUpperCase(),
      cookie_em_cache: Boolean(sessao.cookie),
      csrf_em_cache: Boolean(sessao.csrfToken),
      atualizado_em: sessao.updatedAt,
      observacao: "Sessão renovada em memória. O valor do cookie não é exibido por segurança."
    });
  } catch (err) {
    res.status(500).json({
      erro: err.message,
      checklist: [
        "Confirme QAS_TAXONE_USER/PRD_TAXONE_USER.",
        "Confirme QAS_TAXONE_PASSWORD/PRD_TAXONE_PASSWORD.",
        "Confirme QAS_TAXONE_LOGIN_URL/PRD_TAXONE_LOGIN_URL.",
        "Se o login for SAML interativo, use fallback por cookie ou publique via App Router/proxy autenticado."
      ]
    });
  }
});

app.get("/api/:env/teste-http-taxone", async (req, res) => {
  try {
    const baseUrl = getTaxOneBaseUrl(req.params.env);
    const appId = encodeURIComponent(taxoneExecution.portalInterceptorAppId);
    const headers = await getAuthHeadersAuto(req.params.env, req.headers);

    const resultado = await callTaxOneHttp(
      `${baseUrl}/tax4b-tart-js/relatorio/200/2026/05/21?portalInterceptorAppId=${appId}`,
      {
        method: "GET",
        headers: {
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "Cookie": headers.Cookie,
          "X-Requested-With": "XMLHttpRequest",
          ...(headers["X-CSRF-Token"] ? { "X-CSRF-Token": headers["X-CSRF-Token"] } : {})
        }
      }
    );

    res.json({
      status: "OK",
      observacao: "O Node conseguiu conectar autenticado no TaxOne.",
      resultado
    });
  } catch (err) {
    res.status(500).json({
      erro: err.message,
      diagnostico: "Se aparecer 401 ou redirect oauth/authorize, cookie/CSRF estão inválidos ou expirados."
    });
  }
});



function getIrrfMandt() {
  return process.env.TAXONE_IRRF_MANDT || process.env.TAXONE_AUTH_TEST_MANDT || "200";
}

function listarMatrizesIrrfConfiguradas() {
  const json = String(process.env.TAXONE_IRRF_MATRIZES_JSON || "").trim();
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map(item => ({
          empresa: String(item.empresa || item.EMPRESA || item.codigo || item.id || "").trim(),
          nome: String(item.nome || item.NOME || item.descricao || item.empresa || item.EMPRESA || "").trim()
        })).filter(item => item.empresa);
      }
    } catch (err) {
      console.warn(`[TaxOne IRRF] TAXONE_IRRF_MATRIZES_JSON inválido: ${err.message}`);
    }
  }

  return [{
    empresa: process.env.TAXONE_IRRF_EMPRESA || "LB01",
    nome: process.env.TAXONE_IRRF_EMPRESA_NOME || "Leroy Merlin Cia Brasileira de Bricolagem"
  }];
}

function montarBatchOData(caminhos) {
  const boundary = `batch_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const body = caminhos.map(caminho =>
    `--${boundary}\r\n` +
    `Content-Type: application/http\r\n` +
    `Content-Transfer-Encoding: binary\r\n\r\n` +
    `GET ${caminho} HTTP/1.1\r\n` +
    `sap-cancel-on-close: true\r\n` +
    `sap-contextid-accept: header\r\n` +
    `Accept: application/json\r\n` +
    `Accept-Language: pt-BR\r\n` +
    `DataServiceVersion: 2.0\r\n` +
    `MaxDataServiceVersion: 2.0\r\n\r\n`
  ).join("") + `--${boundary}--\r\n`;
  return { boundary, body };
}

async function chamarIrrfBatchPuppeteer(env, caminhos) {
  const appId = encodeURIComponent("tax4b.irrf.ui");
  const { boundary, body } = montarBatchOData(caminhos);
  const raw = await chamarTaxOneViaPuppeteerRaw(
    env,
    "POST",
    `/~1.0.0~/tax4b-irrf-odata/OD_IRRF.xsodata/$batch?portalInterceptorAppId=${appId}`,
    body,
    // Mantém o header igual ao capturado no TaxOne PRD.
    // Em PRD o OD_IRRF retorna HTTP 500 quando o batch sai diferente do navegador.
    { "Content-Type": `multipart/mixed;boundary=${boundary}`, "Accept": "multipart/mixed" },
    `${String(env).toLowerCase()}-irrf`
  );
  return parseBatchJsonPayloads(raw);
}

function extrairResultsBatch(payloads) {
  return (payloads || []).map(payload => {
    const d = payload && payload.d ? payload.d : payload;
    if (d && Array.isArray(d.results)) return d.results;
    return [];
  });
}

function statusIrrfTexto(status) {
  const n = Number(status);
  if (n === 1) return "Atualizado";
  if (n === 2) return "Atualizando";
  if (n === 3) return "Erro";
  return "Sem movimento";
}

async function listarPeriodosIrrfPuppeteer(env, empresa, ano, mesSelecionado = null) {
  const mandt = getIrrfMandt();
  const mesNum = mesSelecionado ? Number(mesSelecionado) : null;
  const mesesConsultar = mesNum && mesNum >= 1 && mesNum <= 12
    ? [mesNum]
    : [Number(new Date().getMonth() + 1)];

  const caminhos = mesesConsultar.map(mes => {
    const periodo = String(mes).padStart(2, "0");
    return `STATUS_PARAM(P_MANDT='${encodeURIComponent(mandt)}',P_EMPRESA='${encodeURIComponent(empresa)}',P_ANO='${encodeURIComponent(ano)}',P_PERIODO='${periodo}')/Results`;
  });

  let resultsPorPeriodo = [];
  try {
    resultsPorPeriodo = extrairResultsBatch(await chamarIrrfBatchPuppeteer(env, caminhos));
  } catch (err) {
    console.warn(`[TaxOne IRRF] Falha ao consultar STATUS_PARAM. Retornando período selecionado sem status live: ${err.message}`);
  }

  const nomesMeses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return mesesConsultar.map((mes, idxRetorno) => {
    const idx = mes - 1;
    const row = (resultsPorPeriodo[idxRetorno] || [])[0] || {};
    const status = row.STATUS ?? 0;
    return {
      mes,
      periodo: String(mes).padStart(2, "0"),
      nome: nomesMeses[idx] || String(mes).padStart(2, "0"),
      irrf: row.IRRF || row.VALOR || "0,00",
      status,
      statusTexto: statusIrrfTexto(status)
    };
  });
}

async function resumoIrrfPuppeteer(env, empresa, periodo) {
  const mandt = getIrrfMandt();

  // Importante para PRD:
  // O TaxOne PRD não envia UI_RESUMO_PARAM no mesmo $batch de pendências/fechamento.
  // O HAR de PRD mostra dois batches separados:
  // 1) UI_TOTAL_EXT_PENDENTE_PARAM + VERIFICA_FECHAMENTO_PARAM
  // 2) UI_RESUMO_PARAM
  // Quando os três GETs são enviados juntos, PRD pode responder HTTP 500 no $batch.
  const caminhosPendencias = [
    `UI_TOTAL_EXT_PENDENTE_PARAM(P_MANDT='${encodeURIComponent(mandt)}',P_EMPRESA='${encodeURIComponent(empresa)}',P_DT_INICIAL='${periodo.dt_inicial}',P_DT_FINAL='${periodo.dt_final}')/Results`,
    `VERIFICA_FECHAMENTO_PARAM(P_MANDT='${encodeURIComponent(mandt)}',P_EMPRESA='${encodeURIComponent(empresa)}',P_DT_INICIAL='${periodo.dt_inicial}',P_DT_FINAL='${periodo.dt_final}')/Results`
  ];

  const caminhosResumo = [
    `UI_RESUMO_PARAM(P_MANDT='${encodeURIComponent(mandt)}',P_EMPRESA='${encodeURIComponent(empresa)}',P_DT_INICIAL='${periodo.dt_inicial}',P_DT_FINAL='${periodo.dt_final}',P_COD_REC='*',P_STATUS=-1)/Results?$skip=0&$top=20&$inlinecount=allpages`
  ];

  const [pendentes = [], fechamento = []] = extrairResultsBatch(await chamarIrrfBatchPuppeteer(env, caminhosPendencias));
  const [resumo = []] = extrairResultsBatch(await chamarIrrfBatchPuppeteer(env, caminhosResumo));

  return {
    empresa,
    mandt,
    periodo: periodo.periodo,
    ano: periodo.ano,
    dt_inicial: periodo.dt_inicial,
    dt_final: periodo.dt_final,
    totalExtemporaneo: pendentes[0]?.TOTAL ?? 0,
    fechamento: fechamento[0]?.STATUS ?? fechamento[0]?.FECHADO ?? "-",
    itens: resumo
  };
}

async function executarApuracaoIrrfPuppeteer(env, periodo, empresa, matrizNome = "") {
  const mandt = getIrrfMandt();
  const appId = encodeURIComponent("tax4b.irrf.ui");
  const payload = {
    MANDT: mandt,
    EMPRESA: String(empresa),
    PERIODO: periodo.periodo,
    ANO: String(periodo.ano)
  };

  const resultado = await chamarTaxOneViaPuppeteer(
    env,
    "PUT",
    `/~1.0.0~/tax4b-irrf-js/buffer/?portalInterceptorAppId=${appId}`,
    payload,
    `${String(env).toLowerCase()}-irrf`
  );

  return { modulo: "irrf", empresa, matrizNome, periodo: periodo.periodo, ano: periodo.ano, payload, resultado };
}

app.get("/api/:env/irrf/matrizes", async (req, res) => {
  try {
    getAmbiente(req.params.env);
    res.setHeader("Cache-Control", "no-store");
    res.json(listarMatrizesIrrfConfiguradas());
  } catch (err) {
    erroDetalhado(res, err);
  }
});

app.get("/api/:env/irrf/periodos", async (req, res) => {
  try {
    getAmbiente(req.params.env);
    const empresa = String(req.query.empresa || process.env.TAXONE_IRRF_EMPRESA || "LB01");
    const ano = Number(req.query.ano || new Date().getFullYear());
    res.setHeader("Cache-Control", "no-store");
    res.json(await listarPeriodosIrrfPuppeteer(req.params.env, empresa, ano, req.query.mes));
  } catch (err) {
    erroDetalhado(res, err);
  }
});

app.get("/api/:env/irrf/resumo", async (req, res) => {
  try {
    getAmbiente(req.params.env);
    const empresa = String(req.query.empresa || process.env.TAXONE_IRRF_EMPRESA || "LB01");
    const periodo = validarPeriodo(req.query.mes, req.query.ano);
    res.setHeader("Cache-Control", "no-store");
    res.json(await resumoIrrfPuppeteer(req.params.env, empresa, periodo));
  } catch (err) {
    erroDetalhado(res, err);
  }
});

app.post("/api/:env/irrf/executar", async (req, res) => {
  try {
    getAmbiente(req.params.env);
    const { mes, ano, empresa, matrizNome } = req.body || {};
    if (!empresa) return res.status(400).json({ erro: "Informe a Matriz/Empresa para executar a Apuração IRRF." });
    const periodo = validarPeriodo(mes, ano);
    const resultado = await executarApuracaoIrrfPuppeteer(req.params.env, periodo, String(empresa), matrizNome || empresa);
    res.json({ aviso: "Apuração IRRF enviada ao TaxOne.", resultado });
  } catch (err) {
    erroDetalhado(res, err);
  }
});


function getIssMandt() {
  return process.env.TAXONE_ISS_MANDT || process.env.TAXONE_IRRF_MANDT || process.env.TAXONE_AUTH_TEST_MANDT || "200";
}

function listarMatrizesIssConfiguradas() {
  const json = String(process.env.TAXONE_ISS_MATRIZES_JSON || "").trim();
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map(item => ({
          empresa: String(item.empresa || item.EMPRESA || item.codigo || item.id || "").trim(),
          nome: String(item.nome || item.NOME || item.descricao || item.empresa || item.EMPRESA || "").trim()
        })).filter(item => item.empresa);
      }
    } catch (err) {
      console.warn(`[TaxOne ISS] TAXONE_ISS_MATRIZES_JSON inválido: ${err.message}`);
    }
  }

  return [{
    empresa: process.env.TAXONE_ISS_EMPRESA || process.env.TAXONE_IRRF_EMPRESA || "LB01",
    nome: process.env.TAXONE_ISS_EMPRESA_NOME || process.env.TAXONE_IRRF_EMPRESA_NOME || "Leroy Merlin Cia Brasileira de Bricolagem"
  }];
}

async function chamarIssBatchPuppeteer(env, caminhos) {
  const appId = encodeURIComponent("tax4b.iss.ui");
  const { boundary, body } = montarBatchOData(caminhos);
  const raw = await chamarTaxOneViaPuppeteerRaw(
    env,
    "POST",
    `/~1.0.0~/tax4b-iss-odata/OD_ISS.xsodata/$batch?portalInterceptorAppId=${appId}`,
    body,
    { "Content-Type": `multipart/mixed; boundary=${boundary}` },
    `${String(env).toLowerCase()}-iss`
  );
  return parseBatchJsonPayloads(raw);
}

function statusIssTexto(status) {
  const n = Number(status);
  if (n === 1) return "Atualizado";
  if (n === 2) return "Atualizando";
  if (n === 3) return "Erro";
  if (n === 5) return "Sem movimento";
  return "Sem movimento";
}

async function listarPeriodosIssPuppeteer(env, empresa, ano, mesSelecionado = null) {
  const mandt = getIssMandt();
  const mesNum = mesSelecionado ? Number(mesSelecionado) : null;
  const mesesConsultar = mesNum && mesNum >= 1 && mesNum <= 12
    ? [mesNum]
    : [Number(new Date().getMonth() + 1)];

  const caminhos = mesesConsultar.map(mes => {
    const periodo = String(mes).padStart(2, "0");
    return `STATUS_PARAM(P_MANDT='${encodeURIComponent(mandt)}',P_EMPRESA='${encodeURIComponent(empresa)}',P_FILIAL='*',P_MUNICIPIO='*',P_ANO='${encodeURIComponent(ano)}',P_PERIODO='${periodo}')/Results`;
  });

  let resultsPorPeriodo = [];
  try {
    resultsPorPeriodo = extrairResultsBatch(await chamarIssBatchPuppeteer(env, caminhos));
  } catch (err) {
    console.warn(`[TaxOne ISS] Falha ao consultar STATUS_PARAM. Retornando período selecionado sem status live: ${err.message}`);
  }

  const nomesMeses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return mesesConsultar.map((mes, idxRetorno) => {
    const idx = mes - 1;
    const row = (resultsPorPeriodo[idxRetorno] || [])[0] || {};
    const status = row.STATUS ?? 0;
    return {
      mes,
      periodo: String(mes).padStart(2, "0"),
      nome: nomesMeses[idx] || String(mes).padStart(2, "0"),
      iss: row.ISS || row.VALOR || "0,00",
      status,
      statusTexto: statusIssTexto(status)
    };
  });
}

async function resumoIssPuppeteer(env, empresa, periodo) {
  const mandt = getIssMandt();
  const appId = encodeURIComponent("tax4b.iss.ui");
  const payload = {
    MANDT: mandt,
    EMPRESA: String(empresa),
    DT_INICIAL: periodo.dt_inicial,
    DT_FINAL: periodo.dt_final,
    TIPO_NF: "*",
    FILTERS: {
      MANDT: mandt,
      EMPRESA: String(empresa),
      PERIODO: periodo.periodo,
      ANO: String(periodo.ano)
    },
    VIEWTYPE: "M"
  };

  let itens = [];
  try {
    const retorno = await chamarTaxOneViaPuppeteer(
      env,
      "POST",
      `/~1.0.0~/tax4b-iss-js/apuracao?portalInterceptorAppId=${appId}`,
      payload,
      `${String(env).toLowerCase()}-iss`
    );
    itens = Array.isArray(retorno) ? retorno : [];
  } catch (err) {
    console.warn(`[TaxOne ISS] Falha ao consultar apuração ISS. Mantendo card enxuto sem itens: ${err.message}`);
  }

  return {
    empresa,
    mandt,
    periodo: periodo.periodo,
    ano: periodo.ano,
    dt_inicial: periodo.dt_inicial,
    dt_final: periodo.dt_final,
    itens
  };
}

async function executarApuracaoIssPuppeteer(env, periodo, empresa, matrizNome = "") {
  const mandt = getIssMandt();
  const appId = encodeURIComponent("tax4b.iss.ui");
  const payload = {
    MANDT: mandt,
    EMPRESA: String(empresa),
    PERIODO: periodo.periodo,
    ANO: String(periodo.ano)
  };

  const resultado = await chamarTaxOneViaPuppeteer(
    env,
    "PUT",
    `/~1.0.0~/tax4b-iss-js/buffer/?portalInterceptorAppId=${appId}`,
    payload,
    `${String(env).toLowerCase()}-iss`
  );

  return { modulo: "iss", empresa, matrizNome, periodo: periodo.periodo, ano: periodo.ano, payload, resultado };
}

app.get("/api/:env/iss/matrizes", async (req, res) => {
  try {
    getAmbiente(req.params.env);
    res.setHeader("Cache-Control", "no-store");
    res.json(listarMatrizesIssConfiguradas());
  } catch (err) {
    erroDetalhado(res, err);
  }
});

app.get("/api/:env/iss/periodos", async (req, res) => {
  try {
    getAmbiente(req.params.env);
    const empresa = String(req.query.empresa || process.env.TAXONE_ISS_EMPRESA || process.env.TAXONE_IRRF_EMPRESA || "LB01");
    const ano = Number(req.query.ano || new Date().getFullYear());
    res.setHeader("Cache-Control", "no-store");
    res.json(await listarPeriodosIssPuppeteer(req.params.env, empresa, ano, req.query.mes));
  } catch (err) {
    erroDetalhado(res, err);
  }
});

app.get("/api/:env/iss/resumo", async (req, res) => {
  try {
    getAmbiente(req.params.env);
    const empresa = String(req.query.empresa || process.env.TAXONE_ISS_EMPRESA || process.env.TAXONE_IRRF_EMPRESA || "LB01");
    const periodo = validarPeriodo(req.query.mes, req.query.ano);
    res.setHeader("Cache-Control", "no-store");
    res.json(await resumoIssPuppeteer(req.params.env, empresa, periodo));
  } catch (err) {
    erroDetalhado(res, err);
  }
});

app.post("/api/:env/iss/executar", async (req, res) => {
  try {
    getAmbiente(req.params.env);
    const { mes, ano, empresa, matrizNome } = req.body || {};
    if (!empresa) return res.status(400).json({ erro: "Informe a Matriz/Empresa para executar a Apuração ISS." });
    const periodo = validarPeriodo(mes, ano);
    const resultado = await executarApuracaoIssPuppeteer(req.params.env, periodo, String(empresa), matrizNome || empresa);
    res.json({ aviso: "Apuração ISS enviada ao TaxOne.", resultado });
  } catch (err) {
    erroDetalhado(res, err);
  }
});



function getPccMandt() {
  return process.env.TAXONE_PCC_MANDT || process.env.TAXONE_IRRF_MANDT || process.env.TAXONE_AUTH_TEST_MANDT || "200";
}

function listarMatrizesPccConfiguradas() {
  const json = String(process.env.TAXONE_PCC_MATRIZES_JSON || "").trim();
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map(item => ({
          empresa: String(item.empresa || item.EMPRESA || item.codigo || item.id || "").trim(),
          nome: String(item.nome || item.NOME || item.descricao || item.empresa || item.EMPRESA || "").trim()
        })).filter(item => item.empresa);
      }
    } catch (err) {
      console.warn(`[TaxOne PCC] TAXONE_PCC_MATRIZES_JSON inválido: ${err.message}`);
    }
  }

  return [{
    empresa: process.env.TAXONE_PCC_EMPRESA || process.env.TAXONE_IRRF_EMPRESA || "LB01",
    nome: process.env.TAXONE_PCC_EMPRESA_NOME || process.env.TAXONE_IRRF_EMPRESA_NOME || "Leroy Merlin Cia Brasileira de Bricolagem"
  }];
}

async function chamarPccBatchPuppeteer(env, caminhos) {
  const appId = encodeURIComponent("tax4b.pcc.ui");
  const { boundary, body } = montarBatchOData(caminhos);
  const raw = await chamarTaxOneViaPuppeteerRaw(
    env,
    "POST",
    `/~1.0.0~/tax4b-pcc-odata/OD_PCC.xsodata/$batch?portalInterceptorAppId=${appId}`,
    body,
    { "Content-Type": `multipart/mixed;boundary=${boundary}`, "Accept": "multipart/mixed" },
    `${String(env).toLowerCase()}-pcc`
  );
  return parseBatchJsonPayloads(raw);
}

function statusPccTexto(status) {
  const n = Number(status);
  if (n === 1) return "Atualizado";
  if (n === 2) return "Atualizando";
  if (n === 3) return "Erro";
  return "Sem movimento";
}

async function listarPeriodosPccPuppeteer(env, empresa, ano, mesSelecionado = null) {
  const mandt = getPccMandt();
  const mesNum = mesSelecionado ? Number(mesSelecionado) : null;
  const mesesConsultar = mesNum && mesNum >= 1 && mesNum <= 12
    ? [mesNum]
    : [Number(new Date().getMonth() + 1)];

  const caminhos = mesesConsultar.map(mes => {
    const periodo = String(mes).padStart(2, "0");
    return `STATUS_CONTAB?$filter=MANDT%20eq%20%27${encodeURIComponent(mandt)}%27%20and%20EMPRESA%20eq%20%27${encodeURIComponent(empresa)}%27%20and%20ANO%20eq%20%27${encodeURIComponent(ano)}%27%20and%20PERIODO%20eq%20%27${periodo}%27%20and%20COD_OBRIGACAO%20eq%20%2711%27`;
  });

  let resultsPorPeriodo = [];
  try {
    resultsPorPeriodo = extrairResultsBatch(await chamarPccBatchPuppeteer(env, caminhos));
  } catch (err) {
    console.warn(`[TaxOne PCC] Falha ao consultar STATUS_CONTAB. Retornando período selecionado sem status live: ${err.message}`);
  }

  const nomesMeses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return mesesConsultar.map((mes, idxRetorno) => {
    const idx = mes - 1;
    const row = (resultsPorPeriodo[idxRetorno] || [])[0] || {};
    const status = row.STATUS ?? row.STATUS_CONTAB ?? 0;
    return {
      mes,
      periodo: String(mes).padStart(2, "0"),
      nome: nomesMeses[idx] || String(mes).padStart(2, "0"),
      pcc: row.PCC || row.VALOR || "0,00",
      status,
      statusTexto: statusPccTexto(status)
    };
  });
}

async function resumoPccPuppeteer(env, empresa, periodo) {
  const mandt = getPccMandt();

  const caminhosPendencias = [
    `UI_TOTAL_EXT_PENDENTE_PARAM(P_MANDT='${encodeURIComponent(mandt)}',P_EMPRESA='${encodeURIComponent(empresa)}',P_DT_INICIAL='${periodo.dt_inicial}',P_DT_FINAL='${periodo.dt_final}')/Results`,
    `VERIFICA_FECHAMENTO_PARAM(P_MANDT='${encodeURIComponent(mandt)}',P_EMPRESA='${encodeURIComponent(empresa)}',P_DT_INICIAL='${periodo.dt_inicial}',P_DT_FINAL='${periodo.dt_final}')/Results`
  ];

  const caminhosResumo = [
    `UI_RESUMO_PARAM(P_MANDT='${encodeURIComponent(mandt)}',P_EMPRESA='${encodeURIComponent(empresa)}',P_DT_INICIAL='${periodo.dt_inicial}',P_DT_FINAL='${periodo.dt_final}',P_COD_REC='*',P_STATUS=-1)/Results?$skip=0&$top=20&$inlinecount=allpages`
  ];

  let pendentes = [];
  let fechamento = [];
  let resumo = [];

  try {
    [pendentes = [], fechamento = []] = extrairResultsBatch(await chamarPccBatchPuppeteer(env, caminhosPendencias));
  } catch (err) {
    console.warn(`[TaxOne PCC] Falha ao consultar pendências/fechamento PCC. Mantendo card enxuto: ${err.message}`);
  }

  try {
    [resumo = []] = extrairResultsBatch(await chamarPccBatchPuppeteer(env, caminhosResumo));
  } catch (err) {
    console.warn(`[TaxOne PCC] Falha ao consultar resumo PCC. Mantendo card enxuto: ${err.message}`);
  }

  return {
    empresa,
    mandt,
    periodo: periodo.periodo,
    ano: periodo.ano,
    dt_inicial: periodo.dt_inicial,
    dt_final: periodo.dt_final,
    totalExtemporaneo: pendentes[0]?.TOTAL ?? 0,
    fechamento: fechamento[0]?.STATUS ?? fechamento[0]?.FECHADO ?? "-",
    itens: resumo
  };
}

async function executarApuracaoPccPuppeteer(env, periodo, empresa, matrizNome = "") {
  const mandt = getPccMandt();
  const appId = encodeURIComponent("tax4b.pcc.ui");
  const payload = {
    MANDT: mandt,
    EMPRESA: String(empresa),
    PERIODO: periodo.periodo,
    ANO: String(periodo.ano)
  };

  const resultado = await chamarTaxOneViaPuppeteer(
    env,
    "PUT",
    `/~1.0.0~/tax4b-pcc-js/cache/?portalInterceptorAppId=${appId}`,
    payload,
    `${String(env).toLowerCase()}-pcc`
  );

  return { modulo: "pcc", empresa, matrizNome, periodo: periodo.periodo, ano: periodo.ano, payload, resultado };
}

app.get("/api/:env/pcc/matrizes", async (req, res) => {
  try {
    getAmbiente(req.params.env);
    res.setHeader("Cache-Control", "no-store");
    res.json(listarMatrizesPccConfiguradas());
  } catch (err) {
    erroDetalhado(res, err);
  }
});

app.get("/api/:env/pcc/periodos", async (req, res) => {
  try {
    getAmbiente(req.params.env);
    const empresa = String(req.query.empresa || process.env.TAXONE_PCC_EMPRESA || process.env.TAXONE_IRRF_EMPRESA || "LB01");
    const ano = Number(req.query.ano || new Date().getFullYear());
    res.setHeader("Cache-Control", "no-store");
    res.json(await listarPeriodosPccPuppeteer(req.params.env, empresa, ano, req.query.mes));
  } catch (err) {
    erroDetalhado(res, err);
  }
});

app.get("/api/:env/pcc/resumo", async (req, res) => {
  try {
    getAmbiente(req.params.env);
    const empresa = String(req.query.empresa || process.env.TAXONE_PCC_EMPRESA || process.env.TAXONE_IRRF_EMPRESA || "LB01");
    const periodo = validarPeriodo(req.query.mes, req.query.ano);
    res.setHeader("Cache-Control", "no-store");
    res.json(await resumoPccPuppeteer(req.params.env, empresa, periodo));
  } catch (err) {
    erroDetalhado(res, err);
  }
});

app.post("/api/:env/pcc/executar", async (req, res) => {
  try {
    getAmbiente(req.params.env);
    const { mes, ano, empresa, matrizNome } = req.body || {};
    if (!empresa) return res.status(400).json({ erro: "Informe a Matriz/Empresa para executar a Apuração PCC." });
    const periodo = validarPeriodo(mes, ano);
    const resultado = await executarApuracaoPccPuppeteer(req.params.env, periodo, String(empresa), matrizNome || empresa);
    res.json({ aviso: "Apuração PCC enviada ao TaxOne.", resultado });
  } catch (err) {
    erroDetalhado(res, err);
  }
});


// =============================================================
// EFD-SPED FISCAL
// Fluxo isolado para o módulo "EFD-Sped Fiscal".
// Não altera ICMS/IRRF/ISS/PCC/Relatórios de Apoio.
// =============================================================
function getEfdSpedMandt() {
  return process.env.TAXONE_EFD_MANDT || process.env.TAXONE_AUTH_TEST_MANDT || "200";
}

function efdSpedBrowserKey(env) {
  return `${String(env || "").toLowerCase()}-efd-sped`;
}

async function chamarEfdSpedBatchPuppeteer(env, caminhos) {
  const appId = encodeURIComponent("tax4b.efd.ui");
  const { boundary, body } = montarBatchOData(caminhos);
  const raw = await chamarTaxOneViaPuppeteerRaw(
    env,
    "POST",
    `/tax4b-efd-odata/OD_EFD.xsodata/$batch?portalInterceptorAppId=${appId}`,
    body,
    { "Content-Type": `multipart/mixed;boundary=${boundary}`, "Accept": "multipart/mixed" },
    efdSpedBrowserKey(env)
  );
  return parseBatchJsonPayloads(raw);
}

function normalizarEstruturasEfdSped(payloads) {
  const itens = [];

  function coletar(obj) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach(coletar);
      return;
    }

    const container = obj.d || obj;
    if (Array.isArray(container.results)) {
      container.results.forEach(coletar);
      return;
    }

    const orgstr = container.CENTRAL_EFD || container.central_efd || container.ORGSTR || container.orgstr;
    if (!orgstr || !String(orgstr).trim()) return;

    itens.push({
      orgstr: String(orgstr).trim(),
      nome: String(container.DESCRICAO || container.NOME || orgstr).trim(),
      empresa: String(container.EMPRESA_MAIN || container.EMPRESA || "").trim(),
      filial: String(container.FILIAL_MAIN || container.FILIAL || "").trim(),
      uf: String(container.UF || "").trim(),
      cnpj: String(container.CNPJ || "").trim(),
      bruto: container
    });
  }

  (payloads || []).forEach(coletar);
  const vistos = new Set();
  return itens
    .filter(item => {
      if (vistos.has(item.orgstr)) return false;
      vistos.add(item.orgstr);
      return true;
    })
    .sort((a, b) => a.orgstr.localeCompare(b.orgstr));
}

async function listarEstruturasEfdSpedPuppeteer(env, periodo) {
  const mandt = getEfdSpedMandt();
  const ano = String(periodo.ano);
  const caminhos = [
    `ORGSTR_EFD(MANDT='${encodeURIComponent(mandt)}',P_DT_INICIAL='${ano}0101',P_DT_FINAL='${ano}1231')`
  ];

  try {
    const estruturas = normalizarEstruturasEfdSped(await chamarEfdSpedBatchPuppeteer(env, caminhos));
    if (estruturas.length) return estruturas;
  } catch (err) {
    console.warn(`[TaxOne EFD-Sped] Falha ao listar ORGSTR_EFD via OD_EFD. Tentando fallback ICMS/local: ${err.message}`);
  }

  try {
    return await listarEstruturasIcmsPuppeteer(env, periodo);
  } catch (err) {
    console.warn(`[TaxOne EFD-Sped] Fallback ICMS indisponível. Usando fallback local: ${err.message}`);
    return listarEstruturasIcmsFallbackLocal();
  }
}

async function obterDetalheEstruturaEfdSpedPuppeteer(env, orgstr) {
  const filtro = encodeURIComponent(`CENTRAL_EFD eq '${String(orgstr).replace(/'/g, "''")}'`);
  const caminhos = [
    `ORGSTR_PARAM(P_DT_INICIAL='19990101',P_DT_FINAL='29990101')/Results?$filter=${filtro}`
  ];
  const [rows = []] = extrairResultsBatch(await chamarEfdSpedBatchPuppeteer(env, caminhos));
  return rows[0] || {};
}

async function listarVariantesEfdSpedPuppeteer(env) {
  const appId = encodeURIComponent("tax4b.efd.ui");
  let retorno;
  try {
    retorno = await chamarTaxOneViaPuppeteer(
      env,
      "GET",
      `/tax4b-efd-js/variante/?portalInterceptorAppId=${appId}`,
      null,
      efdSpedBrowserKey(env)
    );
  } catch (err) {
    if (isBrowserUserDataDirLockedError(err)) {
      console.warn(`[TaxOne EFD-Sped] Profile do navegador em uso ao listar variantes. Retornando fallback vazio/controlado: ${err.message}`);
      return [];
    }
    throw err;
  }

  const lista = Array.isArray(retorno) ? retorno : [];
  return lista
    .filter(item => String(item.REMOVIDO || "") !== "X")
    .filter(item => !item.ID_OBRIGACAO || Number(item.ID_OBRIGACAO) === 66)
    .map(item => {
      let valores = {};
      try { valores = item.VALORES ? JSON.parse(item.VALORES) : {}; } catch (_) { valores = {}; }
      return {
        id: item.ID,
        codigo: item.CODIGO || valores.CODIGO || item.ID,
        descricao: item.DESCRICAO || valores.DESCRICAO || "",
        padrao: item.PADRAO || "N",
        idObrigacao: item.ID_OBRIGACAO,
        valores
      };
    });
}


async function obterCsrfEfdSpedPuppeteer(page, baseUrl) {
  const appId = encodeURIComponent("tax4b.efd.ui");
  return page.evaluate(async ({ baseUrl, appId }) => {
    const candidatos = [
      `${baseUrl}/tax4b-efd-js/variante/?portalInterceptorAppId=${appId}`,
      `${baseUrl}/tax4b-efd-js/EFD/?portalInterceptorAppId=${appId}`,
      `${baseUrl}/tax4b-efd-js/EFD/validate-period-status/?portalInterceptorAppId=${appId}`
    ];

    for (const url of candidatos) {
      try {
        const resp = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers: {
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRF-Token": "Fetch"
          }
        });
        const token = resp.headers.get("x-csrf-token") || resp.headers.get("X-CSRF-Token");
        if (token && String(token).toLowerCase() !== "required") return token;
      } catch (_) {}
    }
    return "";
  }, { baseUrl, appId });
}

async function getCookieHeaderFromPuppeteerPage(page, baseUrl) {
  try {
    const cookies = await page.cookies(baseUrl);
    return cookies
      .filter(cookie => cookie && cookie.name && cookie.value)
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');
  } catch (_) {
    return '';
  }
}

async function chamarEfdSpedJsPuppeteer(env, metodo, pathComQuery, payload = null) {
  const keyUpper = String(env || "").toUpperCase();
  const baseUrl = getTaxOneBaseUrl(env);
  const browserKey = efdSpedBrowserKey(env);
  const page = await ensureTaxOneLoggedInPuppeteer(env, browserKey);
  const url = `${baseUrl}${pathComQuery.startsWith("/") ? "" : "/"}${pathComQuery}`;
  const csrf = await obterCsrfEfdSpedPuppeteer(page, baseUrl).catch(() => "") || await obterCsrfPuppeteer(page, baseUrl).catch(() => "");
  const cookie = await getCookieHeaderFromPuppeteerPage(page, baseUrl);

  if (!cookie) {
    throw new Error(`Sessão EFD-Sped sem cookies disponíveis no Puppeteer para ${keyUpper}. Faça login novamente no perfil do browser.`);
  }

  const parsedUrl = new URL(url);
  const headers = {
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Content-Type": "application/json; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    "Cookie": cookie,
    "Origin": `${parsedUrl.protocol}//${parsedUrl.host}`,
    "Referer": `${baseUrl}/sites`
  };

  if (csrf) {
    headers["X-CSRF-Token"] = csrf;
    headers["X-Csrf-Token"] = csrf;
  }

  const body = payload !== null && payload !== undefined ? JSON.stringify(payload) : undefined;
  const resultadoDetalhado = await callTaxOneHttpDetailed(url, {
    method: metodo,
    headers,
    body,
    okStatuses: [201, 202, 204]
  });

  const resultado = resultadoDetalhado.body;
  console.log(`[TaxOne EFD-Sped][${keyUpper}] ${metodo} ${pathComQuery} OK. CSRF=${csrf ? "SIM" : "NAO"}. HTTP=${resultadoDetalhado.statusCode}. Retorno=${typeof resultado === "string" ? resultado.slice(0, 1000) : JSON.stringify(resultado).slice(0, 1000)}`);
  return resultado;
}

async function validarPeriodoEfdSpedPuppeteer(env, periodo, orgstr) {
  const appId = encodeURIComponent("tax4b.efd.ui");
  const payload = {
    MANDT: getEfdSpedMandt(),
    ORGSTR: String(orgstr),
    PERIODO: periodo.periodo,
    ANO: String(periodo.ano)
  };

  const retorno = await chamarEfdSpedJsPuppeteer(
    env,
    "POST",
    `/tax4b-efd-js/EFD/validate-period-status/?portalInterceptorAppId=${appId}`,
    payload
  );

  if (retorno && retorno.isValid === false) {
    throw new Error(retorno.message || retorno.msg || "Período não liberado para geração do EFD-Sped Fiscal.");
  }
  return retorno;
}

async function gerarEfdSpedFiscalPuppeteer(env, periodo, orgstr, orgstrNome = "", varianteId = "", varianteCodigo = "", empresaEfd = "", filialEfd = "") {
  const appId = encodeURIComponent("tax4b.efd.ui");
  const variantes = await listarVariantesEfdSpedPuppeteer(env);
  const variante = variantes.find(v =>
    String(v.id || "") === String(varianteId || "") ||
    String(v.codigo || "") === String(varianteCodigo || "")
  ) || variantes.find(v => v.padrao === "S") || variantes[0] || { valores: {} };

  if (!variante || !variante.valores) {
    throw new Error("Nenhuma variante disponível para geração do EFD-Sped Fiscal.");
  }

  const valores = variante.valores || {};

  // Importante: na execução agendada não detalhar a ORGSTR via OD_EFD.xsodata/$batch.
  // Em alguns ambientes o $batch retorna 403, mas a geração do SPED funciona com os dados
  // já selecionados/salvos no agendamento. Assim evitamos bloquear a execução do agendamento.
  const detalhe = {
    EMPRESA_MAIN: empresaEfd || valores.EMPRESA || process.env.TAXONE_EFD_EMPRESA || "LB01",
    FILIAL_MAIN: filialEfd || valores.FILIAL || ""
  };

  // Fluxo real do TaxOne para EFD-Sped Fiscal não chama validate-period-status antes da geração.
  // O HAR validado mostra a sequência: carregar variante/detalhar ORGSTR e enviar diretamente POST /tax4b-efd-js/EFD/.
  // A chamada validate-period-status estava retornando 403 e bloqueando a geração manual/agendada.

  const payload = {
    MANDT: valores.MANDT || getEfdSpedMandt(),
    ORGSTR: String(orgstr),
    DT_PER: periodo.periodo,
    DT_ANO: String(periodo.ano),
    REPORT_KEY: valores.REPORT_KEY || "",
    COD_FINALITY: valores.COD_FINALITY || "0",
    EFD_CONTRIB: valores.EFD_CONTRIB || "",
    PARTNF: valores.PARTNF || "",
    BLOCKH: valores.BLOCKH || "",
    PLANT: valores.PLANT || "",
    OFFICIAL_RUN: valores.OFFICIAL_RUN || "",
    ESTR_BALANCO: valores.ESTR_BALANCO || "",
    DESCRIPTION: valores.DESCRIPTION || "EFDICMSIPITAX4B",
    SPED_VERSION: valores.SPED_VERSION || process.env.TAXONE_EFD_SPED_VERSION || "018",
    IMONTH: valores.IMONTH || "",
    IYEAR: valores.IYEAR || "",
    EMPRESA: detalhe.EMPRESA_MAIN || valores.EMPRESA || process.env.TAXONE_EFD_EMPRESA || "LB01",
    FILIAL: detalhe.FILIAL_MAIN || valores.FILIAL || "",
    ELE: Boolean(valores.ELE),
    OTHER_REASON: Boolean(valores.OTHER_REASON),
    MOT_RANGE: Array.isArray(valores.MOT_RANGE) ? valores.MOT_RANGE : [],
    REG_INC: Array.isArray(valores.REG_INC) ? valores.REG_INC : [],
    REG_EXC: Array.isArray(valores.REG_EXC) ? valores.REG_EXC : [],
    IND_TP_LAYOUT: valores.IND_TP_LAYOUT || process.env.TAXONE_EFD_IND_TP_LAYOUT || "1"
  };

  const resultado = await chamarEfdSpedJsPuppeteer(
    env,
    "POST",
    `/tax4b-efd-js/EFD/?portalInterceptorAppId=${appId}`,
    payload
  );

  console.log(`[TaxOne EFD-Sped][${String(env).toUpperCase()}] POST /tax4b-efd-js/EFD/ enviado com sucesso. Retorno=${typeof resultado === "string" ? resultado : JSON.stringify(resultado).slice(0, 1000)}`);

  return {
    modulo: "efd_sped",
    moduloNome: "EFD-Sped Fiscal",
    ambiente: getAmbiente(env).nome,
    orgstr,
    orgstrNome: orgstrNome || orgstr,
    variante: { id: variante.id, codigo: variante.codigo, descricao: variante.descricao },
    periodo,
    payload_enviado: payload,
    resultado
  };
}


async function gerarEfdSpedFiscalAgendadoPuppeteer(env, periodo, agendamento) {
  const appId = encodeURIComponent("tax4b.efd.ui");
  const orgstr = String(agendamento.orgstr || "").trim();
  if (!orgstr) throw new Error("Estrutura Organizacional EFD-Sped Fiscal não informada no agendamento.");

  const variantes = await listarVariantesEfdSpedPuppeteer(env);
  const variante = variantes.find(v =>
    String(v.id || "") === String(agendamento.varianteId || "") ||
    String(v.codigo || "") === String(agendamento.varianteCodigo || "")
  ) || variantes.find(v => v.padrao === "S") || variantes[0] || { valores: {} };

  const valores = variante.valores || {};
  const filialDerivada = String(agendamento.filialEfd || "").trim() || ((orgstr.match(/^[A-Z](\d{4})_/) || [])[1] || "");
  const empresaDerivada = String(agendamento.empresaEfd || "").trim() || valores.EMPRESA || process.env.TAXONE_EFD_EMPRESA || "LB01";

  const payload = {
    MANDT: valores.MANDT || getEfdSpedMandt(),
    ORGSTR: orgstr,
    DT_PER: periodo.periodo,
    DT_ANO: String(periodo.ano),
    REPORT_KEY: valores.REPORT_KEY || "",
    COD_FINALITY: valores.COD_FINALITY || "0",
    EFD_CONTRIB: valores.EFD_CONTRIB || "",
    PARTNF: valores.PARTNF || "",
    BLOCKH: valores.BLOCKH || "",
    PLANT: valores.PLANT || "",
    OFFICIAL_RUN: valores.OFFICIAL_RUN || "",
    ESTR_BALANCO: valores.ESTR_BALANCO || "",
    DESCRIPTION: valores.DESCRIPTION || "EFDICMSIPITAX4B",
    SPED_VERSION: valores.SPED_VERSION || process.env.TAXONE_EFD_SPED_VERSION || "018",
    IMONTH: valores.IMONTH || "",
    IYEAR: valores.IYEAR || "",
    EMPRESA: empresaDerivada,
    FILIAL: filialDerivada,
    ELE: Boolean(valores.ELE),
    OTHER_REASON: Boolean(valores.OTHER_REASON),
    MOT_RANGE: Array.isArray(valores.MOT_RANGE) ? valores.MOT_RANGE : [],
    REG_INC: Array.isArray(valores.REG_INC) ? valores.REG_INC : [],
    REG_EXC: Array.isArray(valores.REG_EXC) ? valores.REG_EXC : [],
    IND_TP_LAYOUT: valores.IND_TP_LAYOUT || process.env.TAXONE_EFD_IND_TP_LAYOUT || "1"
  };

  console.log(`[TaxOne EFD-Sped][${String(env).toUpperCase()}] Executando agendamento. POST /tax4b-efd-js/EFD/ ORGSTR=${payload.ORGSTR} ANO=${payload.DT_ANO} MES=${payload.DT_PER} VARIANTE=${variante.codigo || variante.id || agendamento.varianteCodigo || agendamento.varianteId}`);

  const resultado = await chamarEfdSpedJsPuppeteer(
    env,
    "POST",
    `/tax4b-efd-js/EFD/?portalInterceptorAppId=${appId}`,
    payload
  );

  console.log(`[TaxOne EFD-Sped][${String(env).toUpperCase()}] POST /tax4b-efd-js/EFD/ enviado com sucesso. Retorno=${typeof resultado === "string" ? resultado : JSON.stringify(resultado).slice(0, 1000)}`);

  return {
    modulo: "efd_sped",
    moduloNome: "EFD-Sped Fiscal",
    ambiente: getAmbiente(env).nome,
    orgstr,
    orgstrNome: agendamento.orgstrNome || orgstr,
    variante: { id: variante.id || agendamento.varianteId, codigo: variante.codigo || agendamento.varianteCodigo, descricao: variante.descricao || agendamento.varianteNome || "" },
    periodo,
    payload_enviado: payload,
    resultado
  };
}

app.get("/api/:env/efd-sped/estruturas", async (req, res) => {
  try {
    getAmbiente(req.params.env);
    const periodo = validarPeriodo(req.query.mes || new Date().getMonth() + 1, req.query.ano || new Date().getFullYear());
    res.setHeader("Cache-Control", "no-store");
    res.json(await listarEstruturasEfdSpedPuppeteer(req.params.env, periodo));
  } catch (err) {
    if (isBrowserUserDataDirLockedError(err)) {
      setTaxOneBrowserLockHeaders(res, efdSpedBrowserKey(req.params.env), err.message);
      res.setHeader("X-TaxOne-Filter", "fallback-local-browser-profile-locked");
      return res.json(listarEstruturasIcmsFallbackLocal());
    }
    erroDetalhado(res, err);
  }
});

app.get("/api/:env/efd-sped/variantes", async (req, res) => {
  try {
    getAmbiente(req.params.env);
    res.setHeader("Cache-Control", "no-store");
    res.json(await listarVariantesEfdSpedPuppeteer(req.params.env));
  } catch (err) {
    if (isBrowserUserDataDirLockedError(err)) {
      setTaxOneBrowserLockHeaders(res, efdSpedBrowserKey(req.params.env), err.message);
      return res.json([]);
    }
    erroDetalhado(res, err);
  }
});

app.post("/api/:env/efd-sped/gerar", async (req, res) => {
  try {
    getAmbiente(req.params.env);
    const { mes, ano, orgstr, orgstrNome, varianteId, varianteCodigo, empresa, filial, empresaEfd, filialEfd } = req.body || {};
    if (!orgstr) return res.status(400).json({ erro: "Informe a Estrutura Organizacional para gerar o EFD-Sped Fiscal." });
    if (!varianteId && !varianteCodigo) return res.status(400).json({ erro: "Informe a Variante para gerar o EFD-Sped Fiscal." });
    const periodo = validarPeriodo(mes, ano);
    res.json(await gerarEfdSpedFiscalPuppeteer(req.params.env, periodo, String(orgstr), orgstrNome || orgstr, varianteId, varianteCodigo, empresaEfd || empresa || "", filialEfd || filial || ""));
  } catch (err) {
    erroDetalhado(res, err);
  }
});


app.get("/api/:env/icms/estruturas", async (req, res) => {
  try {
    getAmbiente(req.params.env);

    // Carregamento normal: local/rápido, sem navegar no TaxOne.
    // Isso evita o erro "Navigating frame was detached" ao trocar de Relatórios de Apoio para ICMS.
    // Use TAXONE_ICMS_ORGSTR_LIVE_REFRESH=true somente quando quiser forçar atualização via OData/HANA.
    const liveRefresh = String(process.env.TAXONE_ICMS_ORGSTR_LIVE_REFRESH || "false").toLowerCase() === "true";
    const periodo = obterPeriodoComFallback(req);
    const estruturas = liveRefresh
      ? await listarEstruturasIcmsPuppeteer(req.params.env, periodo)
      : listarEstruturasIcmsFallbackLocal();

    res.setHeader("Cache-Control", "no-store");
    res.json(estruturas.map(item => ({
      orgstr: item.orgstr,
      nome: item.nome
    })));
  } catch (err) {
    erroDetalhado(res, err);
  }
});

app.post("/api/:env/icms/executar", async (req, res) => {
  try {
    getAmbiente(req.params.env);
    const { mes, ano, orgstr, orgstrNome } = req.body || {};
    if (!orgstr) return res.status(400).json({ erro: "Informe a Estrutura Organizacional para executar a Apuração ICMS." });
    const periodo = validarPeriodo(mes, ano);
    const resultado = await executarApuracaoIcmsPuppeteer(req.params.env, periodo, String(orgstr), orgstrNome || orgstr);
    res.json({
      aviso: "Apuração ICMS enviada ao TaxOne.",
      resultado
    });
  } catch (err) {
    erroDetalhado(res, err);
  }
});

app.get("/api/:env/grupos", async (req, res) => {
  try {
    const ambiente = getAmbiente(req.params.env);

    const sql = `
      select "ID", "NOME"
      from "${ambiente.schema}"."tax4b.tart::CD_RELATORIO.GRUPO"
      order by "NOME" asc
    `;

    let rows = await runQuery(ambiente, sql);

    // Fallback de segurança: em alguns ambientes o cadastro de grupo pode não retornar
    // pela tabela de grupo, mas os relatórios continuam contendo GRUPO_ID.
    // Assim o frontend não fica vazio em PRD; ele monta a lista a partir dos relatórios.
    if (!rows || rows.length === 0) {
      const fallbackSql = `
        select distinct
          "GRUPO_ID" as "ID",
          'Grupo ' || cast("GRUPO_ID" as nvarchar(50)) as "NOME"
        from "${ambiente.schema}"."tax4b.tart::CD_RELATORIO.RELATORIO"
        where "GRUPO_ID" is not null
        order by "GRUPO_ID" asc
      `;
      rows = await runQuery(ambiente, fallbackSql);
    }

    res.setHeader("Cache-Control", "no-store");
    res.json((rows || []).map(row => ({
      id: row.ID,
      nome: row.NOME
    })));
  } catch (err) {
    erroDetalhado(res, err);
  }
});

app.get("/api/:env/grupos/:grupoId/relatorios", async (req, res) => {
  try {
    const ambiente = getAmbiente(req.params.env);
    const grupoId = req.params.grupoId;

    const sql = `
      select
        "GRUPO_ID",
        "ID",
        "NOME",
        "FONTE_ID",
        "MANDT",
        "EMPRESA",
        "ORGSTR",
        "TIPO",
        "TIPO_EXPORTACAO",
        "DT_INICIAL",
        "DT_FINAL",
        "CV_FONTE"
      from "${ambiente.schema}"."tax4b.tart::CD_RELATORIO.RELATORIO"
      where "GRUPO_ID" = ?
      order by "NOME" asc
    `;

    const rows = await runQuery(ambiente, sql, [grupoId]);

    if (!rows.length) {
      return res.json([]);
    }

    // Se o TaxOne HTTP estiver desabilitado, não tenta consultar /tax4b-tart-js/relatorio.
    // A lista é retornada diretamente do HANA, evitando 401 e dependência de cookie/CSRF.
    if (!taxoneExecution.enabled) {
      res.setHeader("X-TaxOne-Filter", "taxone-disabled-hana-only");
      return res.json(respostaRelatorios(rows));
    }

    // REGRA DE TELA:
    // A lista visível deve seguir o TaxOne. O HANA é usado apenas para complementar os dados técnicos
    // dos relatórios que o TaxOne retornou como disponíveis.
    // Isso evita voltar a exibir relatórios cadastrados no HANA, mas que não aparecem no TaxOne.
    let periodo;
    let statusTaxOne;
    let listaTaxOne;

    try {
      periodo = obterPeriodoComFallback(req);
      const mandt = req.query?.mandt || rows[0].MANDT;

      statusTaxOne = await consultarStatusGrupoTaxOne(
        req.params.env,
        mandt,
        periodo.ano,
        periodo.periodo,
        grupoId,
        req.headers
      );

      listaTaxOne = extrairListaTaxOne(statusTaxOne);
    } catch (err) {
      console.warn("Filtro TaxOne obrigatório falhou. Causa:", err.message);

      // Quando o Chrome/Edge fica preso usando o profile persistente do Puppeteer,
      // a tela não deve ficar inutilizável. Nesse caso liberamos a lista do HANA
      // com cabeçalhos de alerta para o frontend exibir o diagnóstico.
      if (isBrowserUserDataDirLockedError(err)) {
        setTaxOneBrowserLockHeaders(res, req.params.env, err.message);
        res.setHeader("X-TaxOne-Filter", "fallback-hana-browser-profile-locked");
        res.setHeader("X-TaxOne-Filter-Motivo", encodeURIComponent(browserProfileLockedMessage(req.params.env)));
        return res.json(respostaRelatorios(rows));
      }

      if (taxoneFilterStrict) {
        return respostaFiltroTaxOneVazio(
          res,
          "Falha ao consultar a lista oficial do TaxOne",
          err.message
        );
      }

      res.setHeader("X-TaxOne-Filter", "fallback-hana-taxone-error");
      return res.json(respostaRelatorios(rows));
    }

    if (!Array.isArray(listaTaxOne) || listaTaxOne.length === 0) {
      console.warn("TaxOne retornou lista vazia para o grupo/período. A lista HANA não será exibida para evitar relatórios extras.");

      if (taxoneFilterStrict) {
        return respostaFiltroTaxOneVazio(
          res,
          "Nenhum relatório retornado pelo TaxOne para esse grupo/período",
          `grupoId=${grupoId}; periodo=${periodo?.periodo}/${periodo?.ano}`
        );
      }

      res.setHeader("X-TaxOne-Filter", "fallback-hana-taxone-empty");
      return res.json(respostaRelatorios(rows));
    }

    const idsVisiveisTaxOne = new Set();
    const nomesVisiveisTaxOne = new Set();

    for (const item of listaTaxOne) {
      const id = item?.ID ?? item?.id ?? item?.RELATORIO_ID ?? item?.relatorio_id ?? item?.ID_RELATORIO ?? item?.id_relatorio ?? item?.relatorioId ?? item?.RelatorioId;
      const nome = item?.NOME ?? item?.nome ?? item?.RELATORIO ?? item?.relatorio ?? item?.DESCRICAO ?? item?.descricao ?? item?.TXT ?? item?.txt ?? item?.Name ?? item?.name;

      if (id !== undefined && id !== null && String(id).trim()) {
        idsVisiveisTaxOne.add(String(id).trim());
      }

      if (nome !== undefined && nome !== null && String(nome).trim()) {
        nomesVisiveisTaxOne.add(normalizarTexto(nome));
      }
    }

    let rowsFiltradas = [];

    if (idsVisiveisTaxOne.size > 0) {
      rowsFiltradas = rows.filter(row => idsVisiveisTaxOne.has(String(row.ID).trim()));
    } else if (nomesVisiveisTaxOne.size > 0) {
      rowsFiltradas = rows.filter(row => nomesVisiveisTaxOne.has(normalizarTexto(row.NOME)));
    } else {
      console.warn("TaxOne respondeu, mas sem ID/NOME reconhecível. A lista HANA não será exibida para evitar relatórios extras.");

      if (taxoneFilterStrict) {
        return respostaFiltroTaxOneVazio(
          res,
          "TaxOne respondeu, mas sem ID/NOME reconhecível para filtrar",
          JSON.stringify(listaTaxOne).slice(0, 500)
        );
      }

      res.setHeader("X-TaxOne-Filter", "fallback-hana-taxone-unrecognized");
      return res.json(respostaRelatorios(rows));
    }

    if (!rowsFiltradas.length) {
      console.warn("Filtro TaxOne aplicado, mas nenhum item bateu com o cadastro HANA. A lista HANA não será exibida para evitar relatórios extras.");

      if (taxoneFilterStrict) {
        return respostaFiltroTaxOneVazio(
          res,
          "Relatórios retornados pelo TaxOne não bateram com o cadastro HANA",
          JSON.stringify(listaTaxOne).slice(0, 500)
        );
      }

      res.setHeader("X-TaxOne-Filter", "fallback-hana-no-match");
      return res.json(respostaRelatorios(rows));
    }

    res.setHeader("X-TaxOne-Filter", "strict-applied");
    res.json(respostaRelatorios(rowsFiltradas));
  } catch (err) {
    erroDetalhado(res, err);
  }
});

app.all("/api/:env/relatorios/:relatorioId/preparar-execucao", async (req, res) => {
  try {
    const ambiente = getAmbiente(req.params.env);
    const relatorioId = req.params.relatorioId;
    const { mes, ano } = obterMesAno(req);

    const periodo = validarPeriodo(mes, ano);
    const rows = await buscarRelatoriosPorIds(ambiente, [relatorioId]);

    if (!rows.length) {
      return res.status(404).json({ erro: "Relatório não encontrado." });
    }

    const resultado = await executarRelatorioTaxOne(req.params.env, ambiente, rows[0], periodo, req.headers);

    res.json({
      aviso: "Execução real enviada ao TaxOne pela rota preparar-execucao.",
      resultado
    });
  } catch (err) {
    erroDetalhado(res, err);
  }
});

app.post("/api/:env/relatorios/executar-lote", async (req, res) => {
  try {
    const ambiente = getAmbiente(req.params.env);
    const { mes, ano } = obterMesAno(req);
    const { relatorioIds } = req.body;

    const periodo = validarPeriodo(mes, ano);

    if (!Array.isArray(relatorioIds) || !relatorioIds.length) {
      return res.status(400).json({ erro: "Informe relatorioIds como array." });
    }

    const rows = await buscarRelatoriosPorIds(ambiente, relatorioIds);

    const encontrados = new Set(rows.map(row => String(row.ID)));
    const naoEncontrados = relatorioIds.filter(id => !encontrados.has(String(id)));

    const resultados = [];
    for (const row of rows) {
      try {
        resultados.push(await executarRelatorioTaxOne(req.params.env, ambiente, row, periodo, req.headers));
      } catch (err) {
        resultados.push({
          relatorio_id: row.ID,
          nome: row.NOME,
          status: "ERRO",
          erro: err.message
        });
      }
    }

    res.json({
      ambiente: ambiente.nome,
      parametros: periodo,
      total_solicitado: relatorioIds.length,
      total_encontrado: rows.length,
      nao_encontrados: naoEncontrados,
      resultados
    });
  } catch (err) {
    erroDetalhado(res, err);
  }
});

app.get("/api/:env/grupos/:grupoId/relatorios-taxone-debug", async (req, res) => {
  try {
    const ambiente = getAmbiente(req.params.env);
    const grupoId = req.params.grupoId;
    const periodo = obterPeriodoComFallback(req);

    const rows = await runQuery(ambiente, `
      select "MANDT"
      from "${ambiente.schema}"."tax4b.tart::CD_RELATORIO.RELATORIO"
      where "GRUPO_ID" = ?
      limit 1
    `, [grupoId]);

    const mandt = req.query?.mandt || rows?.[0]?.MANDT;
    if (!mandt) {
      return res.status(404).json({ erro: "Não foi possível identificar o MANDT do grupo." });
    }

    const statusTaxOne = await consultarStatusGrupoTaxOne(
      req.params.env,
      mandt,
      periodo.ano,
      periodo.periodo,
      grupoId,
      req.headers
    );

    const listaExtraida = extrairListaTaxOne(statusTaxOne);

    res.json({
      ambiente: ambiente.nome,
      grupoId,
      mandt,
      periodo,
      quantidade_extraida: listaExtraida.length,
      lista_extraida: listaExtraida,
      retorno_bruto_taxone: statusTaxOne
    });
  } catch (err) {
    erroDetalhado(res, err);
  }
});

app.get("/api/:env/relatorios/status", async (req, res) => {
  try {
    const { mandt, ano, periodo, grupoId } = req.query;

    if (!mandt || !ano || !periodo || !grupoId) {
      return res.status(400).json({
        erro: "Informe mandt, ano, periodo e grupoId.",
        exemplo: `/api/${req.params.env}/relatorios/status?mandt=200&ano=2026&periodo=05&grupoId=21`
      });
    }

    const status = await consultarStatusGrupoTaxOne(req.params.env, mandt, ano, periodo, grupoId, req.headers);
    res.json(status);
  } catch (err) {
    erroDetalhado(res, err);
  }
});



// =============================================================
// AGENDAMENTO DE RELATÓRIOS
// Mantém as rotas originais e apenas acrescenta persistência + execução agendada.
// =============================================================
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "data");
const AGENDAMENTOS_FILE = path.join(DATA_DIR, "agendamentos.json");
const HISTORICO_FILE = path.join(DATA_DIR, "historico-execucoes.json");
const tarefasAgendadas = new Map();

function garantirArquivosAgendamento() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(AGENDAMENTOS_FILE)) fs.writeFileSync(AGENDAMENTOS_FILE, "[]", "utf8");
  if (!fs.existsSync(HISTORICO_FILE)) fs.writeFileSync(HISTORICO_FILE, "[]", "utf8");
}

function lerJsonArquivo(file, fallback = []) {
  garantirArquivosAgendamento();
  try {
    const raw = fs.readFileSync(file, "utf8");
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.error(`Falha ao ler ${file}:`, err.message);
    return fallback;
  }
}

function salvarJsonArquivo(file, dados) {
  garantirArquivosAgendamento();
  fs.writeFileSync(file, JSON.stringify(dados, null, 2), "utf8");
}

function lerAgendamentos() {
  return lerJsonArquivo(AGENDAMENTOS_FILE, []);
}

function salvarAgendamentos(agendamentos) {
  salvarJsonArquivo(AGENDAMENTOS_FILE, agendamentos);
}


function erroTaxOneNaoBloqueanteExecucao(msg) {
  const texto = String(msg || "");
  // O endpoint /relatorio/... é usado para consultar status/filtro do TaxOne.
  // Em alguns momentos ele retorna HTTP 500/Internal server error mesmo após a geração ter sido disparada.
  // Isso deve ser tratado como AVISO, não como falha da execução.
  const ehConsultaStatus = /tax4b-tart-js\/relatorio\//i.test(texto) || /consultar.*status|status.*TaxOne|Filtro TaxOne|lista.*TaxOne/i.test(texto);
  const ehGeracao = /geracao_relatorio\/geracao/i.test(texto);
  return ehConsultaStatus && !ehGeracao;
}

function normalizarResultadoAgendamento(resultado) {
  if (!resultado || typeof resultado !== "object") return resultado;
  const status = String(resultado.status || "").toUpperCase();
  const erro = String(resultado.erro || resultado.detalhe || "");
  if ((status === "ERRO" || status.includes("ERROR") || status.includes("FALH")) && erroTaxOneNaoBloqueanteExecucao(erro)) {
    return {
      ...resultado,
      status: "AVISO",
      aviso: "A geração foi disparada, mas a consulta de status/filtro do TaxOne falhou. Não classificado como falha operacional.",
      erro_original: resultado.erro,
      erro: null
    };
  }
  return resultado;
}

function resultadoEhErroBloqueante(resultado) {
  if (!resultado || typeof resultado !== "object") return false;
  const status = String(resultado.status || "").toUpperCase();
  if (status.includes("AVISO") || status.includes("WARNING")) return false;
  if (!(status === "ERRO" || status.includes("ERROR") || status.includes("FALH"))) return false;
  return !erroTaxOneNaoBloqueanteExecucao(resultado.erro || resultado.detalhe || "");
}

function registrarHistoricoExecucao(item) {
  const historico = lerJsonArquivo(HISTORICO_FILE, []);
  historico.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    data: new Date().toISOString(),
    ...item
  });
  salvarJsonArquivo(HISTORICO_FILE, historico.slice(0, 300));
}

function validarHorarioAgendamento(horario) {
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(String(horario || ""))) {
    throw new Error("Horário inválido. Use HH:mm, exemplo 23:30.");
  }
}

function ehDiaUtil(date) {
  const d = date.getDay();
  return d >= 1 && d <= 5;
}

function obterDataDiaUtilDoMes(ano, mesZeroBased, ordem, hora = 0, minuto = 0) {
  const alvo = Number(ordem || 1);
  let encontrados = 0;
  for (let dia = 1; dia <= 31; dia++) {
    const data = new Date(ano, mesZeroBased, dia, hora, minuto, 0, 0);
    if (data.getMonth() !== mesZeroBased) break;
    if (!ehDiaUtil(data)) continue;
    encontrados += 1;
    if (encontrados === alvo) return data;
  }
  return null;
}

function ehDataDiaUtilOrdem(date, ordem) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  const alvo = Number(ordem || 1);
  const dataAlvo = obterDataDiaUtilDoMes(date.getFullYear(), date.getMonth(), alvo, date.getHours(), date.getMinutes());
  return Boolean(dataAlvo && dataAlvo.getFullYear() === date.getFullYear() && dataAlvo.getMonth() === date.getMonth() && dataAlvo.getDate() === date.getDate());
}

function montarCronExpression({ recorrencia, horario, diaSemana, diaMes, diaUtil }) {
  validarHorarioAgendamento(horario);
  const [hora, minuto] = String(horario).split(":");

  if (recorrencia === "diario") return `${Number(minuto)} ${Number(hora)} * * *`;

  if (recorrencia === "semanal") {
    const ds = Number(diaSemana);
    if (Number.isNaN(ds) || ds < 0 || ds > 6) throw new Error("Dia da semana inválido. Use 0=Domingo até 6=Sábado.");
    return `${Number(minuto)} ${Number(hora)} * * ${ds}`;
  }

  if (recorrencia === "mensal") {
    const du = Number(diaUtil || diaMes || 1);
    if (Number.isNaN(du) || du < 1 || du > 5) {
      throw new Error("Dia útil inválido. Para recorrência mensal, selecione 1º, 2º, 3º, 4º ou 5º dia útil.");
    }
    // node-cron não suporta diretamente "Nº dia útil". Agenda nos 7 primeiros dias
    // e valida a ordem do dia útil antes de executar.
    return `${Number(minuto)} ${Number(hora)} 1-7 * *`;
  }

  throw new Error("Recorrência inválida. Use diario, semanal ou mensal.");
}

function modoPeriodoAgendamentoBackend(agendamento) {
  return String(
    agendamento.periodoModo ||
    agendamento.modoPeriodo ||
    agendamento.tipoPeriodo ||
    "dinamico"
  ).toLowerCase();
}

function calcularProximaExecucaoAgendamento(agendamento, referencia = new Date()) {
  if (!agendamento || !agendamento.horario) return null;

  const [horaRaw, minutoRaw] = String(agendamento.horario).split(":");
  const hora = Number(horaRaw);
  const minuto = Number(minutoRaw);
  if (Number.isNaN(hora) || Number.isNaN(minuto)) return null;

  const ref = new Date(referencia);
  ref.setSeconds(0, 0);

  if (agendamento.recorrencia === "diario") {
    const proxima = new Date(ref);
    proxima.setHours(hora, minuto, 0, 0);
    if (proxima <= ref) proxima.setDate(proxima.getDate() + 1);
    return proxima;
  }

  if (agendamento.recorrencia === "semanal") {
    const alvo = Number(agendamento.diaSemana);
    if (Number.isNaN(alvo) || alvo < 0 || alvo > 6) return null;
    const proxima = new Date(ref);
    const hoje = ref.getDay();
    let diasAte = (alvo - hoje + 7) % 7;
    proxima.setDate(ref.getDate() + diasAte);
    proxima.setHours(hora, minuto, 0, 0);
    if (proxima <= ref) proxima.setDate(proxima.getDate() + 7);
    return proxima;
  }

  if (agendamento.recorrencia === "mensal") {
    const ordemDiaUtil = Number(agendamento.diaUtil || agendamento.diaMes || 1);
    if (Number.isNaN(ordemDiaUtil) || ordemDiaUtil < 1 || ordemDiaUtil > 5) return null;
    let proxima = obterDataDiaUtilDoMes(ref.getFullYear(), ref.getMonth(), ordemDiaUtil, hora, minuto);
    if (!proxima || proxima <= ref) {
      proxima = obterDataDiaUtilDoMes(ref.getFullYear(), ref.getMonth() + 1, ordemDiaUtil, hora, minuto);
    }
    return proxima;
  }

  return null;
}

function periodoDescricaoPorData(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function parsePeriodoDescricao(periodo) {
  const match = String(periodo || "").match(/^(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const mes = Number(match[1]);
  const ano = Number(match[2]);
  if (Number.isNaN(mes) || Number.isNaN(ano) || mes < 1 || mes > 12) return null;
  return { mes, ano };
}

function compararPeriodo(a, b) {
  if (!a || !b) return 0;
  return (Number(a.ano) * 12 + Number(a.mes)) - (Number(b.ano) * 12 + Number(b.mes));
}

function adicionarMesPeriodo(periodo, quantidade = 1) {
  if (!periodo) return null;
  const data = new Date(Number(periodo.ano), Number(periodo.mes) - 1 + Number(quantidade), 1);
  return { mes: data.getMonth() + 1, ano: data.getFullYear() };
}

function formatarPeriodoDescricao(periodo) {
  if (!periodo) return null;
  return `${String(periodo.mes).padStart(2, "0")}/${periodo.ano}`;
}

function calcularProximoPeriodoDescricaoAgendamento(agendamento, referencia = new Date()) {
  if (modoPeriodoAgendamentoBackend(agendamento) === "fixo" && agendamento.mes && agendamento.ano) {
    return `${String(agendamento.mes).padStart(2, "0")}/${agendamento.ano}`;
  }

  // Para recorrência mensal, nunca repetir a mesma competência já executada.
  // Exemplo: se 06/2026 já foi executado, a próxima geração deve ser 07/2026.
  if (agendamento.recorrencia === "mensal" && agendamento.ultimo_periodo) {
    const ultimo = parsePeriodoDescricao(agendamento.ultimo_periodo);
    const proximo = adicionarMesPeriodo(ultimo, 1);
    const proximaData = calcularProximaExecucaoAgendamento(agendamento, referencia);
    const periodoPelaProximaData = proximaData ? { mes: proximaData.getMonth() + 1, ano: proximaData.getFullYear() } : null;

    if (!periodoPelaProximaData || compararPeriodo(periodoPelaProximaData, proximo) < 0) {
      return formatarPeriodoDescricao(proximo);
    }
  }

  const proxima = calcularProximaExecucaoAgendamento(agendamento, referencia);
  return periodoDescricaoPorData(proxima || referencia);
}

function atualizarResumoProximaExecucaoAgendamento(agendamento, referencia = new Date()) {
  const proxima = calcularProximaExecucaoAgendamento(agendamento, referencia);
  agendamento.proxima_execucao = proxima ? proxima.toISOString() : null;
  agendamento.proximo_periodo = calcularProximoPeriodoDescricaoAgendamento(agendamento, referencia);
  return agendamento;
}

function periodoAtualParaAgendamento(agendamento, dataExecucao = new Date()) {
  const modoPeriodo = modoPeriodoAgendamentoBackend(agendamento);

  // Modo fixo: mantém o mês/ano gravado no agendamento.
  if (modoPeriodo === "fixo" && agendamento.mes && agendamento.ano) {
    return validarPeriodo(agendamento.mes, agendamento.ano);
  }

  // Modo dinâmico mensal: usa mês/ano da data real de execução, mas evita repetir
  // uma competência que já foi executada por este agendamento.
  // Exemplo: executou 06/2026; a próxima execução deve gerar 07/2026, mesmo que
  // o botão "Executar agora" seja acionado novamente ainda em junho.
  if (agendamento.recorrencia === "mensal" && agendamento.ultimo_periodo) {
    const periodoPelaData = { mes: dataExecucao.getMonth() + 1, ano: dataExecucao.getFullYear() };
    const ultimo = parsePeriodoDescricao(agendamento.ultimo_periodo);
    if (ultimo && compararPeriodo(periodoPelaData, ultimo) <= 0) {
      const proximo = adicionarMesPeriodo(ultimo, 1);
      return validarPeriodo(proximo.mes, proximo.ano);
    }
  }

  // Modo dinâmico: usa sempre o mês/ano da data real de execução.
  // Exemplo: execução em 02/07/2026 gera competência 07/2026.
  return validarPeriodo(dataExecucao.getMonth() + 1, dataExecucao.getFullYear());
}

async function executarAgendamento(agendamento) {
  const dataExecucao = new Date();
  const inicio = dataExecucao.toISOString();
  try {
    const modulo = String(agendamento.modulo || "tart").toLowerCase();
    const ambiente = getAmbiente(agendamento.env);
    const periodo = periodoAtualParaAgendamento(agendamento, dataExecucao);
    const resultados = [];

    if (modulo === "tart") {
      const rows = await buscarRelatoriosPorIds(ambiente, agendamento.relatorioIds || []);
      for (const row of rows) {
        try {
          resultados.push(await executarRelatorioTaxOne(agendamento.env, ambiente, row, periodo, {}));
        } catch (err) {
          resultados.push({ relatorio_id: row.ID, nome: row.NOME, status: "ERRO", erro: err.message });
        }
      }
    } else if (modulo === "icms") {
      if (!agendamento.orgstr) throw new Error("Estrutura Organizacional ICMS não informada no agendamento.");
      try {
        resultados.push(await executarApuracaoIcmsPuppeteer(
          agendamento.env,
          periodo,
          agendamento.orgstr,
          agendamento.orgstrNome || agendamento.orgstr
        ));
      } catch (err) {
        resultados.push({ modulo: "icms", orgstr: agendamento.orgstr, status: "ERRO", erro: err.message });
      }
    } else if (modulo === "irrf") {
      if (!agendamento.empresa) throw new Error("Matriz/Empresa IRRF não informada no agendamento.");
      try {
        resultados.push(await executarApuracaoIrrfPuppeteer(
          agendamento.env,
          periodo,
          agendamento.empresa,
          agendamento.matrizNome || agendamento.empresa
        ));
      } catch (err) {
        resultados.push({ modulo: "irrf", empresa: agendamento.empresa, status: "ERRO", erro: err.message });
      }
    } else if (modulo === "iss") {
      if (!agendamento.empresa) throw new Error("Matriz/Empresa ISS não informada no agendamento.");
      try {
        resultados.push(await executarApuracaoIssPuppeteer(
          agendamento.env,
          periodo,
          agendamento.empresa,
          agendamento.matrizNome || agendamento.empresa
        ));
      } catch (err) {
        resultados.push({ modulo: "iss", empresa: agendamento.empresa, status: "ERRO", erro: err.message });
      }
    } else if (modulo === "pcc") {
      if (!agendamento.empresa) throw new Error("Matriz/Empresa PCC não informada no agendamento.");
      try {
        resultados.push(await executarApuracaoPccPuppeteer(
          agendamento.env,
          periodo,
          agendamento.empresa,
          agendamento.matrizNome || agendamento.empresa
        ));
      } catch (err) {
        resultados.push({ modulo: "pcc", empresa: agendamento.empresa, status: "ERRO", erro: err.message });
      }
    } else if (modulo === "efd_sped") {
      if (!agendamento.orgstr) throw new Error("Estrutura Organizacional EFD-Sped Fiscal não informada no agendamento.");
      if (!agendamento.varianteId && !agendamento.varianteCodigo) throw new Error("Variante EFD-Sped Fiscal não informada no agendamento.");
      try {
        resultados.push(await gerarEfdSpedFiscalAgendadoPuppeteer(
          agendamento.env,
          periodo,
          agendamento
        ));
      } catch (err) {
        resultados.push({ modulo: "efd_sped", orgstr: agendamento.orgstr, variante: agendamento.varianteCodigo || agendamento.varianteId, status: "ERRO", erro: err.message });
      }
    } else {
      throw new Error(`Módulo ${agendamento.moduloNome || modulo} ainda está em implantação.`);
    }

    const fimExecucao = new Date();

    const resultadosNormalizados = resultados.map(normalizarResultadoAgendamento);
    const temErroBloqueante = resultadosNormalizados.some(resultadoEhErroBloqueante);
    const temAviso = resultadosNormalizados.some(r => /AVISO|WARNING/i.test(String(r?.status || "")));
    const statusExecucao = temErroBloqueante ? "CONCLUIDO_COM_ERRO" : (temAviso ? "CONCLUIDO_COM_AVISO" : "CONCLUIDO");
    const erroExecucao = resultadosNormalizados.find(resultadoEhErroBloqueante)?.erro || null;
    const registroHistorico = {
      agendamento_id: agendamento.id,
      nome: agendamento.nome,
      modulo: agendamento.modulo || "tart",
      moduloNome: agendamento.moduloNome || "Relatórios de Apoio",
      ambiente: ambiente.nome,
      inicio,
      fim: fimExecucao.toISOString(),
      status: statusExecucao,
      periodo,
      total: resultados.length,
      resultados: resultadosNormalizados,
      erro: erroExecucao
    };
    registrarHistoricoExecucao(registroHistorico);

    // Atualiza o resumo visual do agendamento para a próxima competência.
    // Exemplo: se uma execução mensal gerou 06/2026 em 02/06/2026,
    // o card passa a mostrar próxima execução/geração em 07/2026.
    try {
      const agendamentos = lerAgendamentos();
      const idx = agendamentos.findIndex(item => item.id === agendamento.id);
      if (idx >= 0) {
        agendamentos[idx].ultima_execucao = fimExecucao.toISOString();
        agendamentos[idx].ultimo_periodo = `${String(periodo.mes).padStart(2, "0")}/${periodo.ano}`;
        agendamentos[idx].ultimo_status = statusExecucao;
        agendamentos[idx].ultimo_erro = erroExecucao;
        atualizarResumoProximaExecucaoAgendamento(agendamentos[idx], new Date(fimExecucao.getTime() + 60000));
        salvarAgendamentos(agendamentos);
      }
    } catch (err) {
      console.warn(`Não foi possível atualizar próxima competência do agendamento ${agendamento.id}:`, err.message);
    }

    return registroHistorico;
  } catch (err) {
    const fimErro = new Date().toISOString();
    const registroErro = {
      agendamento_id: agendamento.id,
      nome: agendamento.nome,
      modulo: agendamento.modulo || "tart",
      moduloNome: agendamento.moduloNome || "Relatórios de Apoio",
      inicio,
      fim: fimErro,
      status: "ERRO",
      erro: err.message
    };
    registrarHistoricoExecucao(registroErro);

    try {
      const agendamentos = lerAgendamentos();
      const idx = agendamentos.findIndex(item => item.id === agendamento.id);
      if (idx >= 0) {
        agendamentos[idx].ultima_execucao = fimErro;
        agendamentos[idx].ultimo_status = "ERRO";
        agendamentos[idx].ultimo_erro = err.message;
        atualizarResumoProximaExecucaoAgendamento(agendamentos[idx], new Date());
        salvarAgendamentos(agendamentos);
      }
    } catch (updateErr) {
      console.warn(`Não foi possível atualizar status de erro do agendamento ${agendamento.id}:`, updateErr.message);
    }

    return registroErro;
  }
}

function pararTarefasAgendadas() {
  for (const task of tarefasAgendadas.values()) {
    try { task.stop(); } catch (_) {}
  }
  tarefasAgendadas.clear();
}

function carregarTarefasAgendadas() {
  pararTarefasAgendadas();
  const agendamentos = lerAgendamentos();

  for (const agendamento of agendamentos) {
    if (!agendamento.ativo) continue;
    try {
      const expression = montarCronExpression(agendamento);
      const task = cron.schedule(expression, () => {
        if (agendamento.recorrencia === "mensal") {
          const ordemDiaUtil = Number(agendamento.diaUtil || agendamento.diaMes || 1);
          if (!ehDataDiaUtilOrdem(new Date(), ordemDiaUtil)) {
            console.log(`Agendamento ${agendamento.id} ignorado: hoje não é o ${ordemDiaUtil}º dia útil do mês.`);
            return;
          }
        }
        return executarAgendamento(agendamento);
      }, {
        timezone: process.env.TZ || "America/Sao_Paulo"
      });
      tarefasAgendadas.set(agendamento.id, task);
    } catch (err) {
      console.error(`Agendamento inválido ${agendamento.id}:`, err.message);
    }
  }
}

app.get("/api/agendamentos", (req, res) => {
  const agendamentos = lerAgendamentos().map(item => atualizarResumoProximaExecucaoAgendamento({ ...item }));
  res.json(agendamentos);
});

app.post("/api/agendamentos", (req, res) => {
  try {
    const body = req.body || {};
    const env = String(body.env || "").toLowerCase();
    getAmbiente(env);

    const modulo = String(body.modulo || "tart").toLowerCase();
    if (!["tart", "icms", "irrf", "iss", "pcc", "efd_sped"].includes(modulo)) {
      return res.status(400).json({ erro: "Este módulo ainda está em implantação." });
    }

    if (modulo === "tart" && (!Array.isArray(body.relatorioIds) || !body.relatorioIds.length)) {
      return res.status(400).json({ erro: "Selecione ao menos um relatório para agendar." });
    }

    if (modulo === "icms" && !body.orgstr) {
      return res.status(400).json({ erro: "Selecione uma Estrutura Organizacional para agendar a Apuração ICMS." });
    }
    if (modulo === "irrf" && !body.empresa) {
      return res.status(400).json({ erro: "Selecione uma Matriz para agendar a Apuração IRRF." });
    }
    if (modulo === "iss" && !body.empresa) {
      return res.status(400).json({ erro: "Selecione uma Matriz para agendar a Apuração ISS." });
    }
    if (modulo === "pcc" && !body.empresa) {
      return res.status(400).json({ erro: "Selecione uma Matriz para agendar a Apuração PCC." });
    }
    if (modulo === "efd_sped" && !body.orgstr) {
      return res.status(400).json({ erro: "Selecione uma Estrutura Organizacional para agendar o EFD-Sped Fiscal." });
    }
    if (modulo === "efd_sped" && !body.varianteId && !body.varianteCodigo) {
      return res.status(400).json({ erro: "Selecione uma Variante para agendar o EFD-Sped Fiscal." });
    }

    const agendamento = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      nome: body.nome || `Agendamento ${new Date().toLocaleString("pt-BR")}`,
      modulo,
      moduloNome: body.moduloNome || (modulo === "icms" ? "Apuração de ICMS" : (modulo === "irrf" ? "Apuração do IRRF" : (modulo === "iss" ? "Apuração de ISS" : (modulo === "pcc" ? "Apuração do PCC" : (modulo === "efd_sped" ? "EFD-Sped Fiscal" : "Relatórios de Apoio"))))),
      moduloIcone: body.moduloIcone || (modulo === "efd_sped" ? "📚" : (modulo === "icms" || modulo === "irrf" || modulo === "iss" || modulo === "pcc" ? "🧾" : "📊")),
      env,
      grupoId: modulo === "tart" ? (body.grupoId || null) : null,
      grupoNome: modulo === "tart" ? (body.grupoNome || null) : null,
      relatorioIds: modulo === "tart" && Array.isArray(body.relatorioIds) ? body.relatorioIds.map(String) : [],
      relatoriosSelecionados: modulo === "tart" && Array.isArray(body.relatoriosSelecionados) ? body.relatoriosSelecionados : [],
      orgstr: (modulo === "icms" || modulo === "efd_sped") ? String(body.orgstr || "") : null,
      orgstrNome: (modulo === "icms" || modulo === "efd_sped") ? (body.orgstrNome || body.orgstr || "") : null,
      empresaEfd: modulo === "efd_sped" ? String(body.empresaEfd || body.empresa || "") : null,
      filialEfd: modulo === "efd_sped" ? String(body.filialEfd || body.filial || "") : null,
      varianteId: modulo === "efd_sped" ? String(body.varianteId || "") : null,
      varianteCodigo: modulo === "efd_sped" ? String(body.varianteCodigo || "") : null,
      varianteNome: modulo === "efd_sped" ? String(body.varianteNome || body.varianteCodigo || body.varianteId || "") : null,
      empresa: (modulo === "irrf" || modulo === "iss" || modulo === "pcc") ? String(body.empresa || "") : null,
      matrizNome: (modulo === "irrf" || modulo === "iss" || modulo === "pcc") ? (body.matrizNome || body.empresa || "") : null,
      recorrencia: body.recorrencia || "diario",
      horario: body.horario,
      diaSemana: body.diaSemana ?? null,
      diaMes: body.diaMes ?? null,
      diaUtil: body.diaUtil ?? (body.recorrencia === "mensal" ? body.diaMes : null),
      // Período dinâmico por padrão: em cada execução usa mês/ano da própria data de execução.
      // Mantemos mes/ano apenas como referência visual/histórica da criação.
      periodoModo: body.periodoModo || body.modoPeriodo || "dinamico",
      mes: body.mes || null,
      ano: body.ano || null,
      ultimo_periodo: null,
      ultima_execucao: null,
      proxima_execucao: null,
      proximo_periodo: null,
      ativo: true,
      criado_em: new Date().toISOString(),
      cron: montarCronExpression(body)
    };

    atualizarResumoProximaExecucaoAgendamento(agendamento);

    const agendamentos = lerAgendamentos();
    agendamentos.push(agendamento);
    salvarAgendamentos(agendamentos);
    carregarTarefasAgendadas();

    res.status(201).json(agendamento);
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});

app.post("/api/agendamentos/:id/executar-agora", async (req, res) => {
  const agendamento = lerAgendamentos().find(item => item.id === req.params.id);
  if (!agendamento) return res.status(404).json({ erro: "Agendamento não encontrado." });
  const resultado = await executarAgendamento(agendamento);
  res.json({ status: resultado?.status || "EXECUCAO_CONCLUIDA", agendamento_id: agendamento.id, resultado });
});

app.patch("/api/agendamentos/:id", (req, res) => {
  try {
    const agendamentos = lerAgendamentos();
    const idx = agendamentos.findIndex(item => item.id === req.params.id);
    if (idx < 0) return res.status(404).json({ erro: "Agendamento não encontrado." });

    agendamentos[idx] = {
      ...agendamentos[idx],
      ...req.body,
      atualizado_em: new Date().toISOString()
    };

    if (req.body.horario || req.body.recorrencia || req.body.diaSemana !== undefined || req.body.diaMes !== undefined || req.body.diaUtil !== undefined) {
      agendamentos[idx].cron = montarCronExpression(agendamentos[idx]);
    }

    salvarAgendamentos(agendamentos);
    carregarTarefasAgendadas();
    res.json(agendamentos[idx]);
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});

app.delete("/api/agendamentos/:id", (req, res) => {
  const agendamentos = lerAgendamentos();
  const filtrados = agendamentos.filter(item => item.id !== req.params.id);
  if (filtrados.length === agendamentos.length) return res.status(404).json({ erro: "Agendamento não encontrado." });
  salvarAgendamentos(filtrados);
  carregarTarefasAgendadas();
  res.json({ status: "REMOVIDO" });
});

app.get("/api/agendamentos-historico", (req, res) => {
  res.json(lerJsonArquivo(HISTORICO_FILE, []).slice(0, 100));
});

app.delete("/api/agendamentos-historico", (req, res) => {
  salvarJsonArquivo(HISTORICO_FILE, []);
  res.json({ status: "LIMPO" });
});

garantirArquivosAgendamento();
carregarTarefasAgendadas();

async function fecharBrowsersTaxOneAntesDeSair() {
  const envs = Array.from(taxoneBrowserSessions.keys());
  await Promise.all(envs.map(env => closeTaxOneBrowser(env, "encerramento do Node")));
}

process.on("SIGINT", async () => {
  await fecharBrowsersTaxOneAntesDeSair();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await fecharBrowsersTaxOneAntesDeSair();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`TaxOne EXECUCAO REAL HTTP FINAL rodando em http://localhost:${port}`);
});
