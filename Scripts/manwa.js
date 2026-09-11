/**
 * 漫蛙 (manwari.cc) 自动签到
 * http-request: 抓 Cookie / Token
 * cron: 每日签到
 *
 * 站点接口：
 *   GET  /api/user/checkin/status
 *   POST /api/user/checkin   body: { "checkin_type": "fixed" | "lucky" }
 *     fixed = 普通签到，固定 5 积分
 *     lucky = 试试手气，随机 1~15 积分
 */

const NAME = "漫蛙签到";
const KEY_COOKIE = "Manwa.Cookie";
const KEY_TOKEN = "Manwa.Token";
const KEY_UA = "Manwa.UA";
const DEFAULT_HOST = "manwari.cc";
const DEFAULT_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function notify(sub, body) {
  $notification.post(NAME, sub || "", body || "");
}

function argMap() {
  const out = {};
  const raw = typeof $argument === "string" ? $argument : "";
  raw.split("&").forEach((p) => {
    if (!p) return;
    const i = p.indexOf("=");
    if (i < 0) {
      out[decodeURIComponent(p)] = "";
      return;
    }
    out[decodeURIComponent(p.slice(0, i))] = decodeURIComponent(p.slice(i + 1));
  });
  return out;
}

function host() {
  const h = (argMap().Host || DEFAULT_HOST).replace(/^https?:\/\//, "").replace(/\/$/, "");
  return h || DEFAULT_HOST;
}

function baseUrl() {
  return `https://${host()}`;
}

function header(obj, name) {
  if (!obj) return "";
  const hit = Object.keys(obj).find((k) => k.toLowerCase() === name.toLowerCase());
  return hit ? obj[hit] : "";
}

function pickToken(cookie, headers) {
  const auth = header(headers, "Authorization");
  if (auth) {
    const m = String(auth).match(/Bearer\s+(.+)/i);
    if (m) return m[1].trim();
    return String(auth).trim();
  }
  const m = String(cookie || "").match(/(?:^|;\s*)authToken=([^;]+)/i);
  return m ? decodeURIComponent(m[1].trim()) : "";
}

function http(opts) {
  return new Promise((resolve, reject) => {
    const method = (opts.method || "GET").toLowerCase();
    const fn = $httpClient[method] || $httpClient.get;
    fn(opts, (err, resp, data) => {
      if (err) return reject(err);
      resolve({
        status: resp.status || resp.statusCode,
        headers: resp.headers || {},
        body: data || "",
      });
    });
  });
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function authHeaders(cookie, token, ua) {
  const h = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    Origin: baseUrl(),
    Referer: `${baseUrl()}/checkin`,
    "User-Agent": ua || DEFAULT_UA,
  };
  if (cookie) h.Cookie = cookie;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

if (typeof $request !== "undefined") {
  const cookie = header($request.headers, "Cookie");
  const token = pickToken(cookie, $request.headers);
  const ua = header($request.headers, "User-Agent");

  if (!cookie && !token) {
    $done({});
  } else {
    let changed = false;
    if (cookie && $persistentStore.read(KEY_COOKIE) !== cookie) {
      $persistentStore.write(cookie, KEY_COOKIE);
      changed = true;
    }
    if (token && $persistentStore.read(KEY_TOKEN) !== token) {
      $persistentStore.write(token, KEY_TOKEN);
      changed = true;
    }
    if (ua) $persistentStore.write(ua, KEY_UA);
    if (changed) notify("获取成功", "登录态已保存，之后可关掉抓包脚本");
    $done({});
  }
} else {
  (async () => {
    const args = argMap();
    const type = (args.Type || "lucky").toLowerCase() === "fixed" ? "fixed" : "lucky";
    const cookie = $persistentStore.read(KEY_COOKIE) || "";
    const token = $persistentStore.read(KEY_TOKEN) || pickToken(cookie, {});
    const ua = $persistentStore.read(KEY_UA) || DEFAULT_UA;

    if (!cookie && !token) {
      notify("无法签到", `请先登录 ${host()}，打开一次签到页或「我的」`);
      return $done();
    }

    const headers = authHeaders(cookie, token, ua);

    try {
      const st = await http({
        url: `${baseUrl()}/api/user/checkin/status`,
        method: "GET",
        headers,
        timeout: 20,
      });

      if (st.status === 401 || /未登录|请先登录|unauthorized/i.test(st.body)) {
        notify("登录失效", "重新登录后再打开一次签到页");
        return $done();
      }
      if (st.status === 403 || /just a moment|cloudflare|cf-browser/i.test(st.body)) {
        notify("被拦截", "Cloudflare 拦了，开着 Surge 再进一次签到页");
        return $done();
      }

      const statusJson = parseJson(st.body);
      if (statusJson && statusJson.code === 200 && statusJson.data && statusJson.data.has_signed_in) {
        const pts = statusJson.data.points_added;
        const rank = statusJson.data.current_rank;
        const extra = [
          pts != null ? `今日 +${pts} 积分` : "",
          rank > 0 ? `排名 ${rank}` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        notify("今日已签到", extra || "今天已经领过了");
        return $done();
      }

      const res = await http({
        url: `${baseUrl()}/api/user/checkin`,
        method: "POST",
        headers,
        body: JSON.stringify({ checkin_type: type }),
        timeout: 20,
      });

      const json = parseJson(res.body);
      const msg = (json && (json.msg || json.message)) || res.body || "无返回";

      if (res.status === 401) {
        notify("登录失效", "重新登录后再打开一次签到页");
      } else if (json && json.code === 200) {
        const data = json.data || {};
        const extra = [
          data.points_added != null ? `+${data.points_added} 积分` : "",
          data.current_rank > 0 ? `排名 ${data.current_rank}` : "",
          type === "lucky" ? "试试手气" : "普通签到",
        ]
          .filter(Boolean)
          .join(" · ");
        notify("签到成功", extra || msg);
      } else if (/已签|重复|already/i.test(String(msg))) {
        notify("今日已签到", msg);
      } else {
        notify(`签到失败 ${res.status}`, String(msg).slice(0, 180));
      }
    } catch (e) {
      notify("请求错误", String(e.message || e));
    }
    $done();
  })();
}
