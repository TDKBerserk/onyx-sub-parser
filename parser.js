const fs = require('fs');
const https = require('https');

// ====== НАСТРОЙКИ СНИППЕТОВ / SNI И CIDR ======
const ALLOWED_SNIS = [
  // Добавь сюда свои SNI при необходимости
];

const ALLOWED_CIDRS = [
  // Добавь сюда свои CIDR при необходимости
];

// ====== ИСТОЧНИКИ ПОДПИСОК ======
function discoverSources() {
  const sources = [
    // GitHub и GitVerse источники (примеры):
    // 'https://raw.githubusercontent.com/user/repo/main/servers.txt',
    // 'https://gitverse.ru/user/repo/raw/main/vless.txt',

    // Telegram-каналы (формат предпросмотра /s/)
    'https://t.me/s/halyava_vpnz',
    'https://t.me/s/hiddifycode',
    'https://t.me/s/TunPass',
    'https://t.me/s/ClosingVPN',
    'https://t.me/s/glforum',
    'https://t.me/s/Ask_a_CM',
    'https://t.me/s/LowiKForum',
    'https://t.me/s/RaViraNet'
  ];
  return Array.from(new Set(sources)).map(normalizeToRawUrl);
}

// ====== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ======

// Нормализация ссылок (GitHub / GitVerse)
function normalizeToRawUrl(url) {
  if (url.includes('github.com') && url.includes('/blob/')) {
    return url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
  }
  if (url.includes('gitverse.ru') && url.includes('/blob/')) {
    return url.replace('/blob/', '/raw/');
  }
  return url;
}

// Загрузка данных по URL
function fetchUrl(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(''));
  });
}

// Извлечение конфигураций VLESS / Trojan из текста
function extractConfigsFromText(text) {
  if (!text) return [];
  
  // Проверка на Base64
  try {
    const decoded = Buffer.from(text.trim(), 'base64').toString('utf-8');
    if (decoded.includes('vless://') || decoded.includes('trojan://')) {
      text = decoded;
    }
  } catch (e) {
    // Не Base64, продолжим с обычным текстом
  }

  const regex = /(vless|trojan):\/\/[^\s"'<>`\]+/g;
  return text.match(regex) || [];
}

// ====== ОСНОВНОЙ ПРОЦЕСС ======
async function main() {
  console.log('🔍 Запуск сбора источников...');
  const sources = discoverSources();
  let allConfigs = [];

  for (const url of sources) {
    console.log(`📥 Загрузка: ${url}`);
    const content = await fetchUrl(url);
    const configs = extractConfigsFromText(content);
    console.log(`   Найдено конфигураций: ${configs.length}`);
    allConfigs.push(...configs);
  }

  // Удаление дубликатов серверов
  const uniqueConfigs = Array.from(new Set(allConfigs));
  console.log(`\n📊 Всего уникальных конфигураций: ${uniqueConfigs.length}`);

  // Сохранение результатов в файл configs.txt
  const outputFileName = 'configs.txt';
  fs.writeFileSync(outputFileName, uniqueConfigs.join('\n'), 'utf-8');
  console.log(`💾 Результат сохранен в ${outputFileName}`);
}

main();
