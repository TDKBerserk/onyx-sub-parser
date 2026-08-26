const fs = require('fs');
const http = require('http');
const https = require('https');

// ====== НАСТРОЙКИ =====
const MAX_CONFIGS = 1000;
const SOURCE_TIMEOUT = 10000;
const SOURCE_PARALLEL_LIMIT = 5;

// Пример списков (замените или дополните своими данными)
const WHITELIST_DOMAINS = new Set(['cloudflare.com', 'google.com']);
const PARSED_CIDRS = []; // Сюда передаются объекто-маски для CIDR

function ipToLong(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function normalizeToRawUrl(url) {
  try {
    if (url.includes('github.com') && url.includes('/blob/')) {
      return url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
    }
    if (url.includes('gitverse.ru') && url.includes('/blob/')) {
      return url.replace('/blob/', '/raw/');
    }
    const u = new URL(url);
    return u.toString();
  } catch (e) {}
  return url;
}

// ====== СПИСОК ИСТОЧНИКОВ ======
function discoverSources() {
  const sources = [
    'https://tgstat.ru/channel/@VlessTrogan',
    'https://tgstat.ru/channel/@hiddifycode',
    'https://tgstat.ru/channel/@TunPass',
    'https://tgstat.ru/channel/@ClosingVPN',
    'https://tgstat.ru/channel/@LowiKForum',
    'https://tgstat.ru/channel/@Ask_a_CM',
    'https://tgstat.ru/channel/@urlsources',
    'https://tgstat.ru/channel/@glforum',
    "https://gitverse.ru/api/repos/bywarm/rser/raw/branch/master/selected.txt",
    "https://gitverse.ru/api/repos/bywarm/rser/raw/branch/master/wl.txt",
    "https://gitverse.ru/api/repos/bywarm/rser/raw/branch/master/merged.txt",
    "https://raw.githubusercontent.com/arhivedxx7/Keyfreetee/refs/heads/main/RKPdee",
    "https://baronnnn.online/exec?url=http%3A%2F%2F77.110.104.181%3A5002%2Fsub%2FUnVUZywxNzg1MjExMzA41gFLhEIf7k",
    "https://is.wepogp.gay/bypass-hwid-lock-3z5O6BFAaJQzGlamvtSo?payload=teJa5U1EevPjDrwxP9eAeOCh1eOFo0eb1FAfxPZ1iNjq2DaSyibM0BiX7aFVQPOCr5TB6YStAUugDUSZmeIq6gMGqXu8WlLO16GqFe7IQCw%3D",
    "https://is.wepogp.gay/bypass-hwid-lock-3z5O6BFAaJQzGlamvtSo?payload=cinZa8HatBaIVylElsc%2B0p2hqFgHs2NUsg9TXUIpDoVqMBmTu9cR8EJaKVX4oYKMMVESrt4jkAhDg/R7lNWc%2BQ%3D%3D",
    "https://is.wepogp.gay/bypass-hwid-lock-3z5O6BFAaJQzGlamvtSo?payload=teJa5U1EevPjDrwxP9eAeArtpaVCD9oExsYZPNhmu0V5X02YvaoSzkj%2B0XFqb%2BehYP7alm1UAjMJFfmCuVVbBaqcHQKcft6YIsKkSxQU40w%3D",
    "https://gist.githubusercontent.com/SoloRepozSF/7810f115b912e7640a11809863045755/raw/SANTA",
    "https://vpn.zotus.ru/sub.php",
    "https://tri.su/nNo2N",
    "https://raw.githubusercontent.com/s0ulcoil/rkvpn/refs/heads/main/randomkeys",
    "https://happ.ring-team.ru/sub/bxj50ed5wy",
    "https://p.kfwl.lol/os=ios/h=SCAM.SANTA.LUCHIY/https://link.flagman.click/sub/wWJsbBP7eAxpu2JZkaDVeFM-1",
    "https://tri.su/mjDpk",
    "https://bit.ly/4wQPqhD",
    "https://is.wepogp.gay/bypass-hwid-lock-3z5O6BFAaJQzGlamvtSo?payload=doAHy/WJZeWcvNQ8P56Ye8epNH09xsBGW3IrmLVHX5eU3idtXuBJja8PKmot6GZBIuFPpshS5WhjLvzQwL%2B/L8xkwszrQwCnYnPMx1Dn2rDHQXTJL%2BP4BJPUP4NpuT0K",
    "https://is.wepogp.gay/bypass-hwid-lock-3z5O6BFAaJQzGlamvtSo?payload=/dAOgZdLKsAWDwgXttns1xvug62mm5gBfGiXXA0jfMf/50mh1EKdKPn/oulAhbtPZHSy/dKHMy3dupLH9qgt0Q%3D%3D",
    "https://tinyurl.com/LTEapple",
    "https://gist.githubusercontent.com/LIKE-FURRY/5faa3fe21cad35b38ceeac729722fee5/raw/bc0ac4b6e578b0ace54480ef40668bc79ac69778/JsonVvless",
    "https://gist.githubusercontent.com/HalyavusVPNUS/a93def732d3c624029c09c393dd0772e/raw/c1804c102de504bbc4034d9752579b77398f371d/%25D0%25BA%25D0%25BE%25D0%25BD%25D1%2584%25D0%25B8%25D0%25B3%25D0%25B8",
    "https://hub.mos.ru/kfwl/subsidia/raw/main/all",
    "https://happ.ring-team.ru/sub/xm1w9dua83",
    "https://happ.ring-team.ru/sub/scb3faxa5f",
    "https://cdn.statically.io/gh/kama55726/KomaryServers/main/KomaryServ",
    "https://cdn.jsdelivr.net/gh/kama55726/KomaryServers@main/KomaryServ",
    "https://happ.ring-team.ru/sub/3r08ng7oni",
    "https://raw.githubusercontent.com/yarikdron01-beep/Key-for-vpnFR/refs/heads/main/Key%20for%20S-WIFI",
    "https://is.wepogp.gay/bypass-hwid-lock-3z5O6BFAaJQzGlamvtSo?payload=VDH4N81qj/PUjkVvXwahEFfEiyNlFCWkMvnGuGtOpnaBMt1X2coAF2U34j9/zcxb4xpSv0a77Q72n8Gx8zESHg%3D%3D",
    "https://v2hub.link/sub/YsXLqYidStCe4_u-6KDkYXX9Mn4vSj-k4Z350Qg-Fo8",
    "https://clck.ru/3UgVmf",
    "https://raw.githubusercontent.com/LimeHi/LimeVPN/refs/heads/main/LimeVPN.txt",
    "https://hub.mos.ru/nfajih/wildvf/-/raw/main/WVFCHEKER",
    "https://hub.mos.ru/nfajih/wildvf/-/raw/main/WVFMINI",
    "https://hub.mos.ru/nfajih/wildvf/-/raw/main/WVFSTANDART",
    "https://sub.shadow-net.site/JCagv3nBd1huQ92w",
    "https://vpnsvpns.github.io/Prihs/mifa.json",
    "https://vpnsvpns.github.io/Prihs/white.json",
    "https://sub.aska.lol/free",
    "https://raw.githubusercontent.com/amintengizbaev2013-a11y/https-t.me-Happkeo/b7fe6f4281edae621c4c16e0945bbf0e9e674bc9/keys_Made_by_ovi_god.txt",
    "https://raw.githubusercontent.com/SoloRepozSF/Key-for-vpn/refs/heads/main/MAIRAM%20VIP",
    "https://is.wepogp.gay/bypass-hwid-lock-3z5O6BFAaJQzGlamvtSo?payload=rlHeaQoEBpzko1BDE8na0jsF5BftJauoGPblqn7gZQaXDFrbZIc8ricjyrjJri9Y6GYOnDO/fBFA7YiRUkY2kM/pyn7Wat2CYgCa66mKvss%3D",
    "https://my-vpn.click/subscriptions/cVMejXH4BaM99cd0Iz-ffA.txt",
    "https://happ.ring-team.ru/sub/5brp3tolpz",
    "https://is.wepogp.gay/bypass-hwid-lock-3z5O6BFAaJQzGlamvtSo?payload=KpDaOrHG/RBjTsFgKHtxQ8bWPs%2BPvU98gu2NoGFrpFJPAtpXKv%2BYhO1aMOLQFAbr9CpU/xpwCVsH%2BAfspVlkUleMEAjPesythZMYN7lTex4%3D",
    "https://happ.ring-team.ru/sub/vcty2nazgk",
    "https://gitverse.ru/api/repos/zieng2/wl/raw/branch/master/list_universal.txt",
    "https://raw.githubusercontent.com/WSJuJuB01/WS_Parser/refs/heads/main/subscription.txt",
    "https://gitverse.ru/api/repos/cid-uskoritel/cid-catwhite-uskoritel/raw/branch/master/configs.txt",
    "https://gitverse.ru/api/repos/Catlerok_glasha/catwhiteMIRROR/raw/branch/master/configs.txt",
    "https://gist.githubusercontent.com/LIKE-FURRY/adb315d93aa5c5bfbbe27fdfb5b30fba/raw/9d3025dc2d248f3aa866d73cf9f53d91ca42ffde/XUYN%25D0%25AF-NA-5-DNEY",
    "https://gist.githubusercontent.com/LIKE-FURRY/b6320e3f6d1bcf981db1c22ff575d4be/raw/a212dadbc9583653750bd906907325cee465a1e9/@scanwebsite-SLIVAET-BEZ-OTMETKN-K-BAMBUK-VPN",
    "https://kosmos.tunnelguard.ru/link.php?client_id=cbce1c81-27b4-4579-89ec-bf4678d70b29",
    "https://gist.githubusercontent.com/HalyavusVPNUS/a93def732d3c624029c09c393dd0772e/raw/079197659fbcf476f938e0228258153daca824ad/%25D0%25BA%25D0%25BE%25D0%25BD%25D1%2584%25D0%25B8%25D0%25B3%25D0%25B8",
    "https://obwl.vercel.app/configs/obchl.txt",
    "https://obwl.vercel.app/configs/premium.txt",
    "https://obwl.vercel.app/configs/selected.txt",
    "https://obwl.vercel.app/configs/configs.txt",
    "https://free-obwl.vercel.app/configs/configs.txt",
    "https://raw.githubusercontent.com/SER38Off/happ-subscription/refs/heads/main/all-white-sub.txt",
    "https://raw.githubusercontent.com/SER38Off/happ-subscription/refs/heads/main/all-white-lists-servers.txt",
    "https://raw.githubusercontent.com/SER38Off/happ-subscription/refs/heads/main/best-white-lists-russia.txt",
    "https://raw.githubusercontent.com/igareck/vpn-configs-for-russia/refs/heads/main/WHITE-CIDR-RU-checked.txt",
    "https://raw.githubusercontent.com/igareck/vpn-configs-for-russia/refs/heads/main/Vless-Reality-White-Lists-Rus-Mobile.txt",
    "https://raw.githubusercontent.com/igareck/vpn-configs-for-russia/refs/heads/main/WHITE-SNI-RU-all.txt",
    "https://raw.githubusercontent.com/dequar/deqwl/refs/heads/main/deray.txt",
    "https://raw.githubusercontent.com/v0id9/vpn-configs/refs/heads/main/vpn.txt",
    "https://raw.githubusercontent.com/AirLinkVPN1/AirLinkVPN/refs/heads/main/rkn_white_list",
    "https://raw.githubusercontent.com/RKPchannel/RKP_bypass_configs/refs/heads/main/whitelist.txt",
    "https://raw.githubusercontent.com/prominbro/sub/refs/heads/main/212.txt",
    "https://raw.githubusercontent.com/prominbro/KfWL/refs/heads/main/KfWL.txt",
    "https://mifa.world/vless",
    "https://mifa.world/turbo",
    "https://hub.mos.ru/kfwl/sub/raw/main/sub.txt",
    "https://codeberg.org/kfwl/sub/raw/branch/main/sub.txt"
  ];
  return Array.from(new Set(sources)).map(normalizeToRawUrl);
}

// ====== ПРОВЕРКИ БЕЛЫХ СПИСКОВ ======
function isIpInCidr(ip) {
  if (!/^([0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) return false;
  const ipLong = ipToLong(ip);
  for (const cidr of PARSED_CIDRS) {
    if ((ipLong & cidr.mask) === (cidr.ip & cidr.mask)) return true;
  }
  return false;
}

function isSniAllowed(sni) {
  if (!sni) return false;
  const lowerSni = sni.toLowerCase().trim();
  if (WHITELIST_DOMAINS.has(lowerSni)) return true;
  for (const domain of WHITELIST_DOMAINS) {
    if (lowerSni.endsWith('.' + domain) || domain.endsWith('.' + lowerSni)) return true;
  }
  return false;
}

// ====== ПАРСИНГ ======
function extractConfigsFromText(text) {
  const list = [];
  if (!text) return list;

  // Автоматическая распаковка Base64
  if (!text.includes('vless://') && !text.includes('trojan://')) {
    try {
      const decoded = Buffer.from(text.trim(), 'base64').toString('utf-8');
      if (decoded.includes('vless://') || decoded.includes('trojan://')) {
        text = decoded;
      }
    } catch (e) {}
  }

  const linkRegex = /(vless|trojan):\/\/[^\s"'<>`\\]+/g;
  const linkMatches = text.match(linkRegex) || [];
  linkMatches.forEach(link => list.push(link.trim()));
  return list;
}

function fetchTextWithHeaders(url) {
  return new Promise((resolve) => {
    let parsedUrl;
    try { parsedUrl = new URL(url); } catch (e) { return resolve(''); }
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };
    let req = lib.get(url, { headers, timeout: SOURCE_TIMEOUT }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, url).toString();
        }
        return resolve(fetchTextWithHeaders(redirectUrl));
      }
      if (res.statusCode !== 200) return resolve('');

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

async function fetchAllSourcesParallel(sources) {
  console.log(`📥 [onyxVPN] Скачивание ${sources.length} источников...`);
  const results = [];
  let index = 0;

  async function sourceWorker() {
    while (index < sources.length) {
      const currentUrl = sources[index++];
      const text = await fetchTextWithHeaders(currentUrl);
      if (text) results.push(text);
    }
  }

  const workers = Array.from({ length: Math.min(SOURCE_PARALLEL_LIMIT, sources.length) }, sourceWorker);
  await Promise.all(workers);
  return results;
}

// ====== ГЛАВНЫЙ ПРОЦЕСС ======
async function main() {
  console.time("⏱️ Общее время выполнения");
  console.log("🚀 Запуск фильтратора onyxVPN (БЕЗ ПИНГА И ПРОВЕРКИ СОЕДИНЕНИЯ)...");
  
  const sources = discoverSources();
  const rawTexts = await fetchAllSourcesParallel(sources);
  const finalConfigs = [];
  const seenUrls = new Set();
  const seenServers = new Set(); 
  let totalExtracted = 0;
  let rejectedByFilters = 0;

  console.log("⚙️ Парсинг, фильтрация по SNI/CIDR и дедупликация...");

  for (const text of rawTexts) {
    if (finalConfigs.length >= MAX_CONFIGS) break;
    const matches = extractConfigsFromText(text);

    for (let line of matches) {
      if (finalConfigs.length >= MAX_CONFIGS) break;
      if (!line || seenUrls.has(line)) continue;
      
      totalExtracted++;

      let urlPart = line;
      const hIdx = line.indexOf('#');
      if (hIdx !== -1) {
        urlPart = line.substring(0, hIdx).trim();
      }

      let hostMatch = urlPart.match(/@([^:]+):([0-9]+)/) || urlPart.match(/:\/\/([^:]+):([0-9]+)/);
      if (!hostMatch) continue;
      const hostOrIp = hostMatch[1];
      const port = hostMatch[2];

      let sni = '';
      const sniMatch = line.match(/[?&]sni=([^&#\s]+)/);
      if (sniMatch) {
        try { sni = decodeURIComponent(sniMatch[1]); } catch (e) { sni = sniMatch[1]; }
      }

      // Фильтрация по Белым Спискам (SNI / CIDR)
      const sniValid = isSniAllowed(sni);
      const cidrValid = isIpInCidr(hostOrIp);

      if (!sniValid && !cidrValid) {
        rejectedByFilters++;
        continue; 
      }

      // Уникальный ключ сервера для удаления повторов
      const serverKey = `${hostOrIp}:${port}:${sni || 'nosni'}`;
      if (seenServers.has(serverKey)) continue;

      seenUrls.add(line);
      seenServers.add(serverKey);

      // 📍 ЗДЕСЬ УКАЗЫВАЕТСЯ ONYXVPN: Формирование нейминга конфига
      const currentSni = sni ? sni : hostOrIp;
      const label = `onyxVPN | ${currentSni}`;
      
      finalConfigs.push(`${urlPart}#${label}`);
    }
  }

  console.log(`\n📊 Найдено сырых конфигураций: ${totalExtracted}`);
  console.log(`✂️ Отсеяно фильтрами (не БС SNI/CIDR): ${rejectedByFilters}`);
  console.log(`✅ Итого добавлено в файл (с учетом уникальности): ${finalConfigs.length}`);

  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  
  // 📍 ЗДЕСЬ УКАЗЫВАЕТСЯ ONYXVPN: Заголовок файла подписки для V2RayN, Sing-Box, Flclash и др.
  const header = `#profile-title: onyxVPN Filtered\n#profile-update-interval: 1\n#announce: 👑 База прокси onyxVPN | Всего: ${finalConfigs.length} | ${timestamp} UTC\n\n`;

  fs.writeFileSync('configs.txt', header + finalConfigs.join('\n'));
  console.log('💾 Результат успешно сохранен в configs.txt!');
  console.timeEnd("⏱️ Общее время выполнения");
}

main();
