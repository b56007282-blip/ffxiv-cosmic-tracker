const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

// 确保数据目录存在
const historyDir = path.join(__dirname, '../data/history');
if (!fs.existsSync(historyDir)) {
  fs.mkdirSync(historyDir, { recursive: true });
}

//============================== 国服 ==============================
async function crawlCN() {
  try {
    const apiUrl = 'https://ff14act.web.sdo.com/api/cosmicData/getCosmicData';
    const requestHeaders = {
      Accept: 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      Connection: 'keep-alive',
      Host: 'ff14act.web.sdo.com',
      Origin: 'https://actff1.web.sdo.com',
      Referer: 'https://actff1.web.sdo.com/',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: 'SNDA_ADRefererSystem_MachineTicket=16020117-20ae-4779-9ce5-d0a7bad0ca93; _ga=GA1.2.335017158.1739280420; userinfo=userid=525090039-1248945546-1757806413&siteid=SDG-08132-01; hasAdsr=1; exp_ff14=s%3AGiF5Bxa4S8X9EqQuET-hyDqyFc1LpoiT.xOJFkwhN5uKB%2BAqH6AVsqopz7ikPnDbYQCbHcGqmYk0; NSC_MC-IE-gg14bdu.xfc.tep.dpn-I80=ffffffff09884eaa45525d5f4f58455e445a4a423660; __wftflow=110058305=1; RT=ul=1762615376328&r=https%3A%2F%2Factff1.web.sdo.com%2Fproject%2F20250619cosmicexploration%2Fv4kjfz92uewnum597r5wr0fa3km7bg%2Findex.html&hd=1762615376559',
      'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"'
    };

    const res = await axios.get(apiUrl, {
      headers: requestHeaders,
      timeout: 15000,
      params: { t: new Date().getTime() },
      withCredentials: true
    });

    if (res.data?.code !== 10000 || !Array.isArray(res.data.data) || res.data.data.length === 0) {
      console.error('国服接口异常', res.data);
      return [];
    }

    return res.data.data.map(item => {
      const raw = parseInt(item.ProgressRate || 0);
      return {
        region: item.area_name || '国服',
        server: item.group_name || '未知服务器',
        progress: Math.min(Math.max(raw / 10, 0), 100),
        level: parseInt(item.DevelopmentGrade || 0),
        lastUpdate: item.data_time || moment().utcOffset(+8).format('YYYY-MM-DD HH:mm:ss'),
        source: 'cn',
        timestamp: new Date().toISOString()
      };
    });
  } catch (err) {
    console.error('国服爬取失败:', err.message);
    return [];
  }
}

//============================== 国际服 ==============================
async function crawlNA() {
  try {
    const url = 'https://na.finalfantasyxiv.com/lodestone/cosmic_exploration/report/';
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        Connection: 'keep-alive'
      },
      timeout: 20000
    });

    const $ = cheerio.load(res.data);
    const servers = [];

    $('.cosmic__report__card').each((i, el) => {
      const serverName = $(el).find('.cosmic__report__card__name p').text().trim();
      if (!serverName) return;

      let progress = 0;
      if ($(el).hasClass('completed')) {
        progress = 100;
      } else {
        const gaugeMatch = ($(el).find('.cosmic__report__status__progress__bar').attr('class') || '').match(/gauge-(\d+)/);
        if (gaugeMatch) progress = Math.round((parseInt(gaugeMatch[1], 10) / 8) * 100 * 10) / 10;
      }

      const level = parseInt($(el).find('.cosmic__report__grade__level p').text().trim() || 0);
      const dcTitle = $(el).closest('.cosmic__report__dc').find('.cosmic__report__dc__title').text().trim();

      const naDCs = ['Aether', 'Crystal', 'Dynamis', 'Primal'];
      const euDCs = ['Chaos', 'Light'];
      const ocDCs = ['Materia'];
      const jpDCs = ['Elemental', 'Gaia', 'Mana', 'Meteor'];

      let region = '国际服-未知区域';
      if (naDCs.includes(dcTitle)) region = '国际服-北美';
      else if (euDCs.includes(dcTitle)) region = '国际服-欧洲';
      else if (ocDCs.includes(dcTitle)) region = '国际服-大洋洲';
      else if (jpDCs.includes(dcTitle)) region = '国际服-日本';

      servers.push({
        region,
        server: serverName,
        dc: dcTitle,
        progress,
        level,
        lastUpdate: moment().utcOffset(+8).format('YYYY-MM-DD HH:mm:ss'),
        source: 'na',
        timestamp: new Date().toISOString()
      });
    });

    console.log(`国际服成功爬取 ${servers.length} 条数据`);
    return servers;
  } catch (err) {
    console.error('国际服爬取失败:', err.message);
    return [];
  }
}

//============================== 读取历史（仅服务器数据） ==============================
function getLastHistoryData() {
  try {
    const files = fs
      .readdirSync(historyDir)
      .filter(f => f.endsWith('.json') && !f.endsWith('.changes.json'))
      .map(f => ({ name: f, time: new Date(f.replace('.json', '').replace(/-/g, ' ')) }))
      .sort((a, b) => b.time - a.time);

    if (files.length) {
      const raw = JSON.parse(fs.readFileSync(path.join(historyDir, files[0].name), 'utf8'));
      return Array.isArray(raw) ? raw : [];
    }
  } catch (e) {
    console.error('读取历史数据失败:', e.message);
  }
  return [];
}

//============================== 主函数 ==============================
async function main() {
  const [cnData, naData] = await Promise.all([crawlCN(), crawlNA()]);
  const currentData = [...cnData, ...naData];
  if (currentData.length === 0) {
    console.log('未获取到任何有效数据');
    return;
  }

  const lastData = getLastHistoryData();

  // 计算当前周期变化
  const progressChanges = [];
  currentData.forEach(cur => {
    const id = `${cur.region}-${cur.server}`;
    const last = lastData.find(item => `${item.region}-${item.server}` === id);
    if (last && last.progress !== cur.progress) {
      progressChanges.push({
        serverId: id,
        oldProgress: last.progress,
        newProgress: cur.progress,
        changeTime: moment().utcOffset(+8).format('YYYY-MM-DD HH:mm:ss')
      });
    }
  });

  /*  关键修复：同一 Moment 实例，统一 GMT+8   */
  const now       = moment().utcOffset(+8);          // 只用这一次
  const timestamp = now.format('YYYY-MM-DD-HH-mm');  // 文件名
  const logTime   = now.format('YYYY-MM-DD HH:mm:ss'); // 日志用

  // 1) 只保存“干净”的服务器快照
  fs.writeFileSync(path.join(historyDir, `${timestamp}.json`), JSON.stringify(currentData, null, 2));

  // 2) 变化信息单独写日志（可选）
  if (progressChanges.length) {
    fs.writeFileSync(
      path.join(historyDir, `${timestamp}.changes.json`),
      JSON.stringify({ type: 'progress_changes', count: progressChanges.length, changes: progressChanges, timestamp: logTime }, null, 2)
    );
  }

  // ---- 打印结果 ----
  console.log(`成功保存 ${currentData.length} 条数据至 ${path.join(historyDir, `${timestamp}.json`)}`);
  if (progressChanges.length) {
    console.log(`当前周期进度变化的服务器: ${progressChanges.map(c => c.serverId).join(', ')}`);
  } else {
    console.log('当前周期无服务器进度变化');
  }
}

main();
