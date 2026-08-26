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
    // Telegram-каналы (публичный просмотр через web-preview /s/)
    'https://t.me/s/VlessTrogan',
    'https://t.me/s/hiddifycode',
    'https://t.me/s/TunPass',
    'https://t.me/s/ClosingVPN',
    'https://t.me/s/LowiKForum',
    'https://t.me/s/Ask_a_CM',
    'https://t.me/s/urlsources',
    'https://t.me/s/glforum',

    // GitHub сырые ссылки
    'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/xray/vless',
    'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/xray/trojan',
    'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/All_Configs_Sub.txt',
    'https://github.com/a2419036/v2ray-sources/blob/main/sources.txt',

    // GitVerse
    'https://gitverse.ru/username/repository/blob/main/configs.txt',
    'https://gitverse.ru/username/repository/raw/main/vless.txt'
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

  const linkRegex = /(vless|trojan):\/\/[^\s"'<>`\]+/g;
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
